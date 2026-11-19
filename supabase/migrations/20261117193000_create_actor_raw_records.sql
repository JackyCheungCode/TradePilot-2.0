create table if not exists public.actor_raw_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references public.discovery_runs(id) on delete restrict,
  actor_id text not null,
  source_id text not null,
  actor_run_id text not null,
  dataset_id text not null,
  item_index integer not null,
  raw_data jsonb not null,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(owner_id,run_id,actor_id,item_index)
);
create index if not exists actor_raw_records_owner_actor_captured_idx on public.actor_raw_records(owner_id,actor_id,captured_at desc);
create index if not exists actor_raw_records_run_idx on public.actor_raw_records(run_id);
alter table public.actor_raw_records enable row level security;
drop policy if exists actor_raw_records_owner_all on public.actor_raw_records;
create policy actor_raw_records_owner_all on public.actor_raw_records for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
