-- Qualify INSERT RETURNING columns to avoid PL/pgSQL OUT parameter ambiguity.
create or replace function public.tradepilot_monitoring_claim_due_tasks(p_limit integer default 20)
returns table(run_id uuid, task_id uuid, owner_id uuid, task_name text, cadence_minutes integer, config jsonb, object_id uuid, platform text, object_type text, source_url text, object_label text)
language plpgsql security definer set search_path=public as $$
begin
 return query
 with due as (
  select t.id,t.owner_id,t.name,t.cadence_minutes,t.config from public.monitoring_tasks t
  where t.status='running' and t.next_run_at is not null and t.next_run_at<=now()
  order by t.next_run_at for update skip locked limit greatest(1,least(coalesce(p_limit,20),100))
 ), scheduled as (
  update public.monitoring_tasks t set next_run_at=now()+make_interval(mins=>t.cadence_minutes),
   last_run_at=now(),last_run_status='queued',updated_at=now()
  from due d where t.id=d.id and t.owner_id=d.owner_id
  returning t.id,t.owner_id,t.name,t.cadence_minutes,t.config
 ), created as (
  insert into public.monitoring_runs as mr(owner_id,task_id,status,provider,started_at,metadata)
  select s.owner_id,s.id,'queued','apify',now(),jsonb_build_object('trigger','cron','scheduledAt',now())
  from scheduled s returning mr.id,mr.task_id,mr.owner_id
 )
 select c.id,c.task_id,c.owner_id,s.name,s.cadence_minutes,s.config,o.id,o.platform,o.object_type,o.source_url,o.label
 from created c join scheduled s on s.id=c.task_id and s.owner_id=c.owner_id
 join public.monitoring_task_objects mto on mto.task_id=c.task_id and mto.owner_id=c.owner_id
 join public.monitoring_objects o on o.id=mto.object_id and o.owner_id=c.owner_id and o.is_active=true;
end; $$;