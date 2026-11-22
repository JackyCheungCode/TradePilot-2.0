-- Cover every monitoring foreign key with a matching leading-column index.
create index if not exists monitoring_task_objects_owner_idx on public.monitoring_task_objects(owner_id);
create index if not exists monitoring_task_objects_task_owner_idx on public.monitoring_task_objects(task_id,owner_id);
create index if not exists monitoring_runs_owner_idx on public.monitoring_runs(owner_id);
create index if not exists monitoring_runs_task_owner_idx on public.monitoring_runs(task_id,owner_id);
create index if not exists monitoring_items_task_owner_idx on public.monitoring_items(task_id,owner_id);
create index if not exists monitoring_items_object_owner_idx on public.monitoring_items(object_id,owner_id);
create index if not exists monitoring_items_run_owner_idx on public.monitoring_items(run_id,owner_id);
create index if not exists monitoring_analyses_owner_idx on public.monitoring_analyses(owner_id);
create index if not exists monitoring_analyses_item_owner_idx on public.monitoring_analyses(item_id,owner_id);
