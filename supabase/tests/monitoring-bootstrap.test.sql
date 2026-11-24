-- Run with psql -v ON_ERROR_STOP=1 after the monitoring migrations.
-- Uses synthetic rows only; this file is safe for disposable local databases.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_active_object uuid;
  v_inactive_object uuid;
  v_active_task uuid;
  v_inactive_task uuid;
  v_claimed integer;
  v_active_runs integer;
  v_inactive_runs integer;
  v_inactive_next_run timestamptz;
  v_policy_count integer;
begin
  insert into auth.users(id) values (v_owner);

  insert into public.monitoring_objects(
    owner_id, platform, object_type, label, source_url, normalized_url, is_active
  ) values (
    v_owner, 'facebook', 'page', 'Active test page',
    'https://example.test/active', 'https://example.test/active', true
  ) returning id into v_active_object;

  insert into public.monitoring_objects(
    owner_id, platform, object_type, label, source_url, normalized_url, is_active
  ) values (
    v_owner, 'facebook', 'page', 'Inactive test page',
    'https://example.test/inactive', 'https://example.test/inactive', false
  ) returning id into v_inactive_object;

  insert into public.monitoring_tasks(
    owner_id, task_code, name, status, cadence_minutes, next_run_at
  ) values (
    v_owner, 'TEST-ACTIVE', 'Active object task', 'running', 60, now() - interval '5 minutes'
  ) returning id into v_active_task;

  insert into public.monitoring_tasks(
    owner_id, task_code, name, status, cadence_minutes, next_run_at
  ) values (
    v_owner, 'TEST-INACTIVE', 'Inactive object task', 'running', 60, now() - interval '5 minutes'
  ) returning id into v_inactive_task;

  insert into public.monitoring_task_objects(owner_id, task_id, object_id)
  values
    (v_owner, v_active_task, v_active_object),
    (v_owner, v_active_task, v_inactive_object),
    (v_owner, v_inactive_task, v_inactive_object);

  select count(*) into v_claimed
  from public.tradepilot_monitoring_claim_due_tasks(20);
  if v_claimed <> 1 then
    raise exception 'Expected one claimed active-object task; got %', v_claimed;
  end if;

  select count(*) into v_active_runs
  from public.monitoring_runs where task_id = v_active_task;
  select count(*) into v_inactive_runs
  from public.monitoring_runs where task_id = v_inactive_task;
  select next_run_at into v_inactive_next_run
  from public.monitoring_tasks where id = v_inactive_task;

  if v_active_runs <> 1 or v_inactive_runs <> 0 then
    raise exception 'Unexpected run creation: active %, inactive %', v_active_runs, v_inactive_runs;
  end if;
  if v_inactive_next_run >= now() then
    raise exception 'Inactive-only task was rescheduled unexpectedly';
  end if;

  if has_function_privilege('authenticated',
    'public.tradepilot_monitoring_claim_due_tasks(integer)', 'EXECUTE') then
    raise exception 'authenticated must not execute the privileged cron claim function';
  end if;
  if not has_function_privilege('service_role',
    'public.tradepilot_monitoring_claim_due_tasks(integer)', 'EXECUTE') then
    raise exception 'service_role must be able to execute the cron claim function';
  end if;

  if not (select relrowsecurity from pg_class where oid='public.monitoring_run_logs'::regclass) then
    raise exception 'monitoring_run_logs RLS must be enabled';
  end if;
  select count(*) into v_policy_count from pg_policies
  where schemaname='public' and tablename='monitoring_run_logs';
  if v_policy_count <> 2 then
    raise exception 'monitoring_run_logs must have two owner-scoped policies; got %', v_policy_count;
  end if;

  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='monitoring_runs' and column_name='heartbeat_at')
    or not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='monitoring_runs' and column_name='current_stage') then
    raise exception 'Monitoring heartbeat/stage columns are missing';
  end if;

  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='discovery_runs' and column_name='hidden_at') then
    raise exception 'discovery_runs.hidden_at is missing';
  end if;
  if not exists (select 1 from pg_constraint
    where conrelid='public.discovery_runs'::regclass
      and conname='discovery_runs_status_check'
      and pg_get_constraintdef(oid) like '%awaiting_approval%'
      and pg_get_constraintdef(oid) like '%partial%') then
    raise exception 'discovery_runs status constraint is incomplete';
  end if;
end $$;
