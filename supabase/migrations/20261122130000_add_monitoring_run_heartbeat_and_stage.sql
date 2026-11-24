alter table public.monitoring_runs
  add column if not exists heartbeat_at timestamptz,
  add column if not exists current_stage text;

create index if not exists monitoring_runs_active_heartbeat_idx
  on public.monitoring_runs(status, heartbeat_at desc)
  where status in ('queued','running');

comment on column public.monitoring_runs.heartbeat_at is '最近一次由 Worker 更新执行进度的时间，用于判断运行实例是否仍然存活';
comment on column public.monitoring_runs.current_stage is 'Worker 当前执行阶段，供监听任务列表和日志控制台展示';
