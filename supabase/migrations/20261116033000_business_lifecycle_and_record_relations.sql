create table if not exists public.business_transition_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_record_type text not null,
  source_record_id uuid not null,
  target_record_type text not null,
  conversion_mode text not null default 'single',
  status text not null default 'draft' check (status in ('draft','validated','awaiting_confirmation','committed','failed','cancelled')),
  idempotency_key text not null,
  request_payload jsonb not null default '{}'::jsonb,
  validation_result jsonb not null default '{}'::jsonb,
  failure_reason text,
  created_by uuid references auth.users(id),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  committed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key),
  unique (id, owner_id)
);

create table if not exists public.business_record_relations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_record_type text not null,
  source_record_id uuid not null,
  target_record_type text not null,
  target_record_id uuid not null,
  relation_type text not null,
  conversion_batch_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint business_record_relations_not_self check (
    source_record_type <> target_record_type or source_record_id <> target_record_id
  ),
  constraint business_record_relations_batch_owner_fk
    foreign key (conversion_batch_id, owner_id)
    references public.business_transition_batches(id, owner_id)
    on delete restrict
);

create table if not exists public.business_transition_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null,
  record_id uuid not null,
  transition_batch_id uuid,
  event_type text not null,
  from_status text,
  to_status text,
  gatekeeper_required boolean not null default false,
  gatekeeper_status text not null default 'not_required'
    check (gatekeeper_status in ('not_required','pending','approved','rejected','overridden')),
  actor_id uuid references auth.users(id),
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint business_transition_events_batch_owner_fk
    foreign key (transition_batch_id, owner_id)
    references public.business_transition_batches(id, owner_id)
    on delete restrict
);

create index if not exists business_record_relations_source_idx
  on public.business_record_relations(owner_id, source_record_type, source_record_id, created_at desc);
create index if not exists business_record_relations_target_idx
  on public.business_record_relations(owner_id, target_record_type, target_record_id, created_at desc);
create unique index if not exists business_record_relations_unique_edge_idx
  on public.business_record_relations(owner_id, source_record_type, source_record_id, target_record_type, target_record_id, relation_type);
create index if not exists business_transition_events_record_idx
  on public.business_transition_events(owner_id, record_type, record_id, created_at desc);
create index if not exists business_transition_batches_source_idx
  on public.business_transition_batches(owner_id, source_record_type, source_record_id, created_at desc);

alter table public.business_transition_batches enable row level security;
alter table public.business_record_relations enable row level security;
alter table public.business_transition_events enable row level security;

drop policy if exists business_transition_batches_owner_select on public.business_transition_batches;
create policy business_transition_batches_owner_select on public.business_transition_batches
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists business_transition_batches_owner_insert on public.business_transition_batches;
create policy business_transition_batches_owner_insert on public.business_transition_batches
  for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists business_transition_batches_owner_update on public.business_transition_batches;
create policy business_transition_batches_owner_update on public.business_transition_batches
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists business_record_relations_owner_select on public.business_record_relations;
create policy business_record_relations_owner_select on public.business_record_relations
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists business_record_relations_owner_insert on public.business_record_relations;
create policy business_record_relations_owner_insert on public.business_record_relations
  for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists business_transition_events_owner_select on public.business_transition_events;
create policy business_transition_events_owner_select on public.business_transition_events
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists business_transition_events_owner_insert on public.business_transition_events;
create policy business_transition_events_owner_insert on public.business_transition_events
  for insert to authenticated with check ((select auth.uid()) = owner_id);

revoke all on public.business_transition_batches from anon;
revoke all on public.business_record_relations from anon;
revoke all on public.business_transition_events from anon;
grant select, insert, update on public.business_transition_batches to authenticated;
grant select, insert on public.business_record_relations to authenticated;
grant select, insert on public.business_transition_events to authenticated;