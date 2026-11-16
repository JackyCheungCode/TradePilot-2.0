-- Private attachment storage for Omnichannel Inbox.
-- Additive only. This migration is intentionally NOT applied to any Supabase project.
begin;

create table if not exists public.inbox_attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null,
  channel_connection_id uuid,
  storage_bucket text not null default 'inbox-attachments'
    check (storage_bucket = 'inbox-attachments'),
  storage_path text not null,
  original_file_name text not null check (length(original_file_name) between 1 and 255),
  content_type text not null check (length(content_type) between 1 and 255),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 26214400),
  sha256_hex text check (sha256_hex is null or sha256_hex ~ '^[a-f0-9]{64}$'),
  scan_status text not null default 'pending'
    check (scan_status in ('pending','clean','rejected','unavailable')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint inbox_attachments_message_owner_fk
    foreign key (message_id, owner_id)
    references public.inbox_messages(id, owner_id) on delete cascade,
  constraint inbox_attachments_connection_owner_fk
    foreign key (channel_connection_id, owner_id)
    references public.inbox_channel_connections(id, owner_id) on delete set null (channel_connection_id),
  unique (storage_bucket, storage_path)
);

-- Durable media-download queue. Jobs are created atomically with their parent message.
create table if not exists public.inbox_media_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null,
  channel_connection_id uuid,
  channel_type text not null check (channel_type in ('whatsapp','line','messenger','telegram')),
  external_media_id text not null check (length(external_media_id) between 1 and 1024),
  provider_url text,
  mime_type_hint text,
  original_file_name text,
  size_bytes_hint bigint check (size_bytes_hint is null or size_bytes_hint > 0),
  provider_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued','processing','completed','failed')),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 10),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inbox_media_jobs_message_owner_fk
    foreign key (message_id, owner_id)
    references public.inbox_messages(id, owner_id) on delete cascade,
  constraint inbox_media_jobs_connection_owner_fk
    foreign key (channel_connection_id, owner_id)
    references public.inbox_channel_connections(id, owner_id) on delete set null (channel_connection_id),
  unique (message_id, external_media_id)
);

create index if not exists inbox_media_jobs_claim_idx
  on public.inbox_media_jobs(status, available_at, created_at)
  where status in ('queued','processing');

alter table public.inbox_media_jobs enable row level security;
revoke all on public.inbox_media_jobs from anon, authenticated;
grant all on public.inbox_media_jobs to service_role;
drop policy if exists inbox_media_jobs_service_role_only on public.inbox_media_jobs;
create policy inbox_media_jobs_service_role_only on public.inbox_media_jobs
  for all to service_role using (true) with check (true);

create index if not exists inbox_attachments_message_idx
  on public.inbox_attachments(owner_id, message_id, created_at);

alter table public.inbox_attachments enable row level security;
revoke all on public.inbox_attachments from anon, authenticated;
grant all on public.inbox_attachments to service_role;

drop policy if exists inbox_attachments_service_role_only on public.inbox_attachments;
create policy inbox_attachments_service_role_only on public.inbox_attachments
  for all to service_role using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inbox-attachments',
  'inbox-attachments',
  false,
  26214400,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf','text/plain',
    'audio/mpeg','audio/mp4','audio/ogg','audio/wav',
    'video/mp4','video/webm',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

-- Never silently weaken or rewrite an existing bucket's security configuration.
do $bucket_guard$
declare
  v_bucket record;
begin
  select public, file_size_limit, allowed_mime_types
    into v_bucket
  from storage.buckets
  where id = 'inbox-attachments';

  if not found
     or v_bucket.public is distinct from false
     or v_bucket.file_size_limit is distinct from 26214400
     or v_bucket.allowed_mime_types is distinct from array[
       'image/jpeg','image/png','image/webp','image/gif',
       'application/pdf','text/plain',
       'audio/mpeg','audio/mp4','audio/ogg','audio/wav',
       'video/mp4','video/webm',
       'application/zip',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
     ]::text[] then
    raise exception 'INBOX_ATTACHMENT_BUCKET_CONFIGURATION_MISMATCH';
  end if;
end;
$bucket_guard$;

-- No authenticated storage.objects policies are created. All object access is mediated
-- by the Worker using service_role after checking conversation/message ownership.

-- Extend atomic message ingestion to enqueue media jobs in the same transaction.
create or replace function public.inbox_process_webhook_event(
  p_event_id uuid,
  p_owner_id uuid,
  p_contact_id uuid,
  p_identity_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $inbox_media_ingest$
declare
  v_event public.inbox_webhook_events%rowtype;
  v_identity public.inbox_customer_identities%rowtype;
  v_account_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_payload jsonb;
  v_content text;
  v_created_at timestamptz;
  v_attachment jsonb;
  v_media_jobs_created integer := 0;
begin
  select * into v_event
  from public.inbox_webhook_events
  where id = p_event_id and owner_id = p_owner_id
    and status in ('processing','unmatched')
  for update;

  if not found then raise exception 'INBOX_WEBHOOK_EVENT_NOT_PROCESSABLE'; end if;

  select c.account_id into v_account_id
  from public.crm_contacts c
  where c.id = p_contact_id and c.owner_id = p_owner_id;
  if not found then raise exception 'CRM_CONTACT_NOT_FOUND'; end if;

  v_payload := coalesce(v_event.payload, '{}'::jsonb);
  if nullif(v_payload->>'externalUserId', '') is null or nullif(v_payload->>'messageId', '') is null then
    raise exception 'INBOX_WEBHOOK_PAYLOAD_INVALID';
  end if;

  select * into v_identity
  from public.inbox_customer_identities
  where id = p_identity_id and owner_id = p_owner_id
    and contact_id = p_contact_id and channel_type = v_event.channel_type
    and external_user_id = v_payload->>'externalUserId'
    and (channel_connection_id is null or channel_connection_id = v_event.channel_connection_id);
  if not found then raise exception 'INBOX_WEBHOOK_IDENTITY_MISMATCH'; end if;

  v_content := coalesce(v_payload->>'content', '');
  v_created_at := coalesce(nullif(v_payload->>'occurredAt', '')::timestamptz, v_event.received_at);

  select c.id into v_conversation_id
  from public.inbox_conversations c
  where c.owner_id = p_owner_id and c.contact_id = p_contact_id
    and c.status in ('open','pending')
  order by c.updated_at desc limit 1 for update;

  if v_conversation_id is null then
    begin
      insert into public.inbox_conversations (
        owner_id, contact_id, account_id, status, unread_count, last_channel_type
      ) values (p_owner_id, p_contact_id, v_account_id, 'open', 0, v_event.channel_type)
      returning id into v_conversation_id;
    exception when unique_violation then
      select c.id into v_conversation_id
      from public.inbox_conversations c
      where c.owner_id = p_owner_id and c.contact_id = p_contact_id
        and c.status in ('open','pending')
      order by c.updated_at desc limit 1 for update;
    end;
  end if;
  if v_conversation_id is null then raise exception 'INBOX_CONVERSATION_CREATE_FAILED'; end if;

  insert into public.inbox_messages (
    owner_id, conversation_id, customer_identity_id, channel_connection_id,
    channel_type, direction, content_type, content, external_message_id,
    status, created_at, metadata
  ) values (
    p_owner_id, v_conversation_id, p_identity_id, v_event.channel_connection_id,
    v_event.channel_type, 'inbound',
    coalesce(nullif(v_payload->>'contentType',''), 'text'),
    v_content, v_payload->>'messageId', 'received', v_created_at,
    coalesce(v_payload->'metadata', '{}'::jsonb)
  )
  on conflict (channel_connection_id, external_message_id)
    where channel_connection_id is not null and external_message_id is not null
  do nothing
  returning id into v_message_id;

  if v_message_id is not null then
    update public.inbox_conversations
    set last_message_at = v_created_at,
        last_channel_type = v_event.channel_type,
        last_message_preview = left(v_content, 500),
        unread_count = unread_count + 1
    where id = v_conversation_id and owner_id = p_owner_id;

    update public.inbox_customer_identities
    set external_display_name = coalesce(nullif(v_payload->>'displayName',''), external_display_name),
        external_username = coalesce(nullif(v_payload->>'username',''), external_username),
        last_seen_at = v_created_at
    where id = p_identity_id and owner_id = p_owner_id;

    if jsonb_typeof(v_payload->'attachments') = 'array' then
      for v_attachment in
        select value from jsonb_array_elements(v_payload->'attachments')
      loop
        if nullif(v_attachment->>'mediaId','') is null then continue; end if;
        insert into public.inbox_media_jobs (
          owner_id, message_id, channel_connection_id, channel_type,
          external_media_id, provider_url, mime_type_hint,
          original_file_name, size_bytes_hint, provider_metadata
        ) values (
          p_owner_id, v_message_id, v_event.channel_connection_id, v_event.channel_type,
          left(v_attachment->>'mediaId', 1024),
          nullif(v_attachment->>'providerUrl',''),
          nullif(v_attachment->>'mimeType',''),
          nullif(left(v_attachment->>'fileName',255),''),
          case when (v_attachment->>'sizeBytes') ~ '^[0-9]{1,12}

            then (v_attachment->>'sizeBytes')::bigint else null end,
          coalesce(v_attachment->'providerMetadata','{}'::jsonb)
        )
        on conflict (message_id, external_media_id) do nothing;
        if found then v_media_jobs_created := v_media_jobs_created + 1; end if;
      end loop;
    end if;
  end if;

  update public.inbox_webhook_events
  set status = 'processed', payload = '{}'::jsonb,
      processed_at = now(), error_code = null
  where id = p_event_id and owner_id = p_owner_id;

  return jsonb_build_object(
    'conversation_id', v_conversation_id,
    'message_id', v_message_id,
    'inserted', v_message_id is not null,
    'media_jobs_created', v_media_jobs_created
  );
end;
$inbox_media_ingest$;

revoke all on function public.inbox_process_webhook_event(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.inbox_process_webhook_event(uuid, uuid, uuid, uuid) to service_role;

commit;
