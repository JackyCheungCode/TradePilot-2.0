select plan(13);

-- Synthetic identity and task fixtures; the surrounding pgTAP transaction rolls back.
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001');

insert into public.monitoring_objects(
  id, owner_id, platform, object_type, label, source_url, normalized_url, is_active
) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   'facebook', 'page', 'Active test page', 'https://example.test/active',
   'https://example.test/active', true),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   'facebook', 'page', 'Inactive test page', 'https://example.test/inactive',
   'https://example.test/inactive', false);

insert into public.monitoring_tasks(
  id, owner_id, task_code, name, status, cadence_minutes, next_run_at
) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   'TEST-ACTIVE', 'Active object task', 'running', 60, now() - interval '5 minutes'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   'TEST-INACTIVE', 'Inactive object task', 'running', 60, now() - interval '5 minutes');

insert into public.monitoring_task_objects(owner_id, task_id, object_id)
values
  ('10000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000002');

create temporary table monitoring_claim_test_result on commit drop as
select * from public.tradepilot_monitoring_claim_due_tasks(20);

select is((select count(*)::int from monitoring_claim_test_result), 1,
  'cron claim returns only the active object task');
select is((select count(*)::int from public.monitoring_runs
  where task_id='30000000-0000-4000-8000-000000000001'), 1,
  'one run is created for the active object task');
select is((select count(*)::int from public.monitoring_runs
  where task_id='30000000-0000-4000-8000-000000000002'), 0,
  'no run is created for the inactive-only task');
select ok((select next_run_at < now() from public.monitoring_tasks
  where id='30000000-0000-4000-8000-000000000002'),
  'inactive-only task remains due and is not rescheduled');
select ok(not has_function_privilege('authenticated',
  'public.tradepilot_monitoring_claim_due_tasks(integer)', 'EXECUTE'),
  'authenticated cannot execute the privileged cron claim function');
select ok(has_function_privilege('service_role',
  'public.tradepilot_monitoring_claim_due_tasks(integer)', 'EXECUTE'),
  'service_role can execute the cron claim function');
select ok((select relrowsecurity from pg_class
  where oid='public.monitoring_run_logs'::regclass),
  'monitoring_run_logs has RLS enabled');
select is((select count(*)::int from pg_policies
  where schemaname='public' and tablename='monitoring_run_logs'), 2,
  'monitoring_run_logs has owner-scoped SELECT and INSERT policies');
select ok(exists(select 1 from information_schema.columns
  where table_schema='public' and table_name='monitoring_runs' and column_name='heartbeat_at'),
  'monitoring_runs has heartbeat_at');
select ok(exists(select 1 from information_schema.columns
  where table_schema='public' and table_name='monitoring_runs' and column_name='current_stage'),
  'monitoring_runs has current_stage');
select ok(exists(select 1 from information_schema.columns
  where table_schema='public' and table_name='discovery_runs' and column_name='hidden_at'),
  'discovery_runs has hidden_at');
select ok(exists(select 1 from pg_constraint
  where conrelid='public.discovery_runs'::regclass
    and conname='discovery_runs_status_check'
    and pg_get_constraintdef(oid) like '%awaiting_approval%'),
  'discovery_runs supports awaiting_approval status');
select ok(exists(select 1 from pg_constraint
  where conrelid='public.discovery_runs'::regclass
    and conname='discovery_runs_status_check'
    and pg_get_constraintdef(oid) like '%partial%'),
  'discovery_runs supports partial status');

select * from finish();
