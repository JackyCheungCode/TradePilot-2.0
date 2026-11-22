alter table public.discovery_runs
  add column if not exists hidden_at timestamptz;

alter table public.discovery_runs
  drop constraint if exists discovery_runs_status_check;

alter table public.discovery_runs
  add constraint discovery_runs_status_check
  check (status in ('planned','queued','running','paused','completed','partial','failed','cancelled'));

create index if not exists discovery_runs_owner_visible_created_idx
  on public.discovery_runs(owner_id, created_at desc)
  where hidden_at is null;
