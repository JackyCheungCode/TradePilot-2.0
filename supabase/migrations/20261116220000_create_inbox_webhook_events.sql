-- Persist provider webhook idempotency keys and only retain normalized payloads when manual customer matching is required.
create table if not exists public.inbox_webhook_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel_connection_id uuid not null,
  channel_type text not null check (channel_type in ('whatsapp','line','messenger','telegram')),
  external_event_id text not null check (length(external_event_id) between 1 and 512),
  event_type text not null default 'message',
  status text not null default 'processing'
    check (status in ('processing','unmatched','processed','ignored','failed')),
  payload jsonb not null default '{}'::jsonb,
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint inbox_webhook_events_connection_owner_fk
    foreign key (channel_connection_id, owner_id)
    references public.inbox_channel_connections(id, owner_id) on delete cascade,
  unique (channel_connection_id, external_event_id)
);

create index if not exists inbox_webhook_events_owner_unmatched_idx
  on public.inbox_webhook_events(owner_id, received_at desc)
  where status = 'unmatched';

alter table public.inbox_webhook_events enable row level security;
drop policy if exists inbox_webhook_events_owner_select on public.inbox_webhook_events;
create policy inbox_webhook_events_owner_select on public.inbox_webhook_events
  for select to authenticated using (owner_id = (select auth.uid()));

revoke all on public.inbox_webhook_events from anon;
revoke insert, update, delete on public.inbox_webhook_events from authenticated;
grant select on public.inbox_webhook_events to authenticated;
grant all on public.inbox_webhook_events to service_role;
