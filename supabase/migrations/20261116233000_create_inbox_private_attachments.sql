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
do $
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
$;

-- No authenticated storage.objects policies are created. All object access is mediated
-- by the Worker using service_role after checking conversation/message ownership.
commit;
