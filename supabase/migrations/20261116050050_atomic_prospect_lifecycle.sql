create or replace function public.confirm_prospect_review(
  p_owner_id uuid,
  p_record_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_record public.discovery_records%rowtype;
  v_now timestamptz := now();
  v_raw jsonb;
  v_stage text;
begin
  if v_uid is distinct from p_owner_id and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Not authorized for this prospect';
  end if;

  select * into v_record
  from public.discovery_records
  where id=p_record_id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'Prospect not found or access denied'; end if;
  if v_record.status <> 'new' then raise exception 'Only newly discovered prospects can be reviewed'; end if;

  v_raw := coalesce(v_record.raw_data,'{}'::jsonb);
  v_stage := coalesce(v_raw->>'lifecycle_stage','discovered');
  if v_stage <> 'discovered' then raise exception 'Prospect has already moved beyond discovery'; end if;

  update public.discovery_records
  set raw_data=jsonb_set(v_raw,'{lifecycle_stage}','"reviewed"'::jsonb,true)
      || jsonb_build_object('lifecycle_updated_at',v_now),
      updated_at=v_now
  where id=p_record_id and owner_id=p_owner_id;

  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    p_owner_id,'prospect',p_record_id,'prospect_reviewed','discovered','reviewed',
    false,'not_required',coalesce(v_uid,p_owner_id),'潜客审核通过',
    jsonb_build_object('source','prospect_console','atomic',true)
  );

  return jsonb_build_object('id',p_record_id,'lifecycleStage','reviewed');
end;
$$;

create or replace function public.promote_prospect_to_lead(
  p_owner_id uuid,
  p_record_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_record public.discovery_records%rowtype;
  v_raw jsonb;
  v_enrichment jsonb;
  v_intelligence jsonb;
  v_stage text;
  v_lead_id uuid;
  v_now timestamptz := now();
begin
  if v_uid is distinct from p_owner_id and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Not authorized for this prospect';
  end if;

  select * into v_record
  from public.discovery_records
  where id=p_record_id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'Prospect not found or access denied'; end if;
  if v_record.record_type not in ('business','website','page') then
    raise exception 'This prospect type cannot be promoted to a CRM lead';
  end if;
  if v_record.status='promoted' and v_record.lead_id is not null then
    return jsonb_build_object('id',p_record_id,'status','promoted','leadId',v_record.lead_id);
  end if;

  v_raw := coalesce(v_record.raw_data,'{}'::jsonb);
  v_enrichment := case when jsonb_typeof(v_raw->'contact_enrichment')='object' then v_raw->'contact_enrichment' else '{}'::jsonb end;
  v_intelligence := case when jsonb_typeof(v_raw->'contact_intelligence')='object' then v_raw->'contact_intelligence' else '{}'::jsonb end;
  v_stage := coalesce(v_raw->>'lifecycle_stage',
    case when coalesce(v_record.email,'')<>'' or coalesce(v_record.phone,'')<>'' or
      jsonb_array_length(case when jsonb_typeof(v_enrichment->'emails')='array' then v_enrichment->'emails' else '[]'::jsonb end)>0 or
      jsonb_array_length(case when jsonb_typeof(v_enrichment->'phones')='array' then v_enrichment->'phones' else '[]'::jsonb end)>0 or
      jsonb_array_length(case when jsonb_typeof(v_enrichment->'addresses')='array' then v_enrichment->'addresses' else '[]'::jsonb end)>0 or
      jsonb_array_length(case when jsonb_typeof(v_intelligence->'candidates')='array' then v_intelligence->'candidates' else '[]'::jsonb end)>0 or
      exists(select 1 from jsonb_each(case when jsonb_typeof(v_enrichment->'social')='object' then v_enrichment->'social' else '{}'::jsonb end) social_entry where jsonb_typeof(social_entry.value)='array' and jsonb_array_length(social_entry.value)>0)
      then 'collected' else 'discovered' end);
  if v_stage <> 'collected' then
    raise exception 'Review and contact enrichment must be completed before promotion';
  end if;
  if not exists(select 1 from public.business_transition_events where owner_id=p_owner_id and record_type='prospect' and record_id=p_record_id and event_type='prospect_reviewed') then
    raise exception 'Prospect review approval is required before promotion';
  end if;

  select id into v_lead_id from public.leads
  where owner_id=p_owner_id and discovery_record_id=p_record_id
  limit 1 for update;

  if v_lead_id is null then
    insert into public.leads(
      owner_id,name,country_code,address,phone,email,website,business_type,
      confidence_score,latitude,longitude,status,dedupe_key,discovery_record_id,
      entity_id,is_formal
    ) values (
      p_owner_id,v_record.name,coalesce(nullif(btrim(v_record.country_code::text),''),'ZZ'),
      v_record.address,v_record.phone,v_record.email,v_record.website,v_record.business_type,
      v_record.confidence_score,v_record.latitude,v_record.longitude,'qualified',
      'discovery:'||p_record_id::text,p_record_id,v_record.entity_id,true
    ) returning id into v_lead_id;
  end if;

  update public.discovery_records
  set status='promoted',lead_id=v_lead_id,
      raw_data=jsonb_set(v_raw,'{lifecycle_stage}','"converted"'::jsonb,true)
        || jsonb_build_object('lifecycle_updated_at',v_now),
      updated_at=v_now
  where id=p_record_id and owner_id=p_owner_id;

  return jsonb_build_object('id',p_record_id,'status','promoted','lifecycleStage','converted','leadId',v_lead_id);
end;
$$;

create or replace function public.capture_prospect_terminal_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text;
  v_to text;
  v_event text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status not in ('promoted','discarded','removed') then return new; end if;

  v_from := coalesce(old.raw_data->>'lifecycle_stage',
    case when old.status='new' then 'discovered' else old.status end);
  v_to := case new.status when 'promoted' then 'converted' else new.status end;
  v_event := case new.status when 'promoted' then 'prospect_converted'
    when 'discarded' then 'prospect_discarded' else 'prospect_removed' end;

  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    new.owner_id,'prospect',new.id,v_event,v_from,v_to,
    false,'not_required',coalesce(auth.uid(),new.owner_id),
    case new.status when 'promoted' then '潜客已转化为 CRM 线索'
      when 'discarded' then '潜客已排除' else '潜客已移除' end,
    jsonb_build_object('lead_id',new.lead_id,'atomic',true)
  );
  return new;
end;
$$;

drop trigger if exists trg_capture_prospect_terminal_event on public.discovery_records;
create trigger trg_capture_prospect_terminal_event
after update of status on public.discovery_records
for each row when (old.status is distinct from new.status)
execute function public.capture_prospect_terminal_event();

revoke all on function public.confirm_prospect_review(uuid,uuid) from public, anon;
revoke all on function public.promote_prospect_to_lead(uuid,uuid) from public, anon;
grant execute on function public.confirm_prospect_review(uuid,uuid) to authenticated, service_role;
grant execute on function public.promote_prospect_to_lead(uuid,uuid) to authenticated, service_role;

create or replace function public.capture_prospect_discovered_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    new.owner_id,'prospect',new.id,'prospect_discovered',null,'discovered',
    false,'not_required',coalesce(auth.uid(),new.owner_id),
    '发现新的潜在客户',
    jsonb_build_object('channel',new.channel,'record_type',new.record_type,'atomic',true)
  );
  return new;
end;
$$;

drop trigger if exists trg_prospect_discovered_lifecycle_event on public.discovery_records;
create trigger trg_prospect_discovered_lifecycle_event
after insert on public.discovery_records
for each row execute function public.capture_prospect_discovered_event();
