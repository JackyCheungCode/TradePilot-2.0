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
commit;
