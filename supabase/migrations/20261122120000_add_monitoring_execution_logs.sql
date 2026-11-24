-- Durable execution console for intelligence monitoring.
create table if not exists public.monitoring_run_logs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 run_id uuid not null,
 task_id uuid not null,
 level text not null check(level in ('debug','info','warning','error')),
 event text not null,
 message text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 foreign key(run_id,owner_id) references public.monitoring_runs(id,owner_id) on delete cascade,
 foreign key(task_id,owner_id) references public.monitoring_tasks(id,owner_id) on delete cascade
);
create index if not exists monitoring_run_logs_owner_created_idx on public.monitoring_run_logs(owner_id,created_at desc);
create index if not exists monitoring_run_logs_run_created_idx on public.monitoring_run_logs(run_id,created_at asc);
alter table public.monitoring_run_logs enable row level security;
grant select,insert on public.monitoring_run_logs to authenticated,service_role;
drop policy if exists monitoring_run_logs_owner_select on public.monitoring_run_logs;
create policy monitoring_run_logs_owner_select on public.monitoring_run_logs for select to authenticated using ((select auth.uid())=owner_id);
drop policy if exists monitoring_run_logs_owner_insert on public.monitoring_run_logs;
create policy monitoring_run_logs_owner_insert on public.monitoring_run_logs for insert to authenticated with check ((select auth.uid())=owner_id);
