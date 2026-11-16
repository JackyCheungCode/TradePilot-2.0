create or replace function public.record_prospect_contact_enrichment(
  p_owner_id uuid,
  p_record_id uuid,
  p_raw_data jsonb,
  p_email text default null,
  p_phone text default null,
  p_address text default null,
  p_has_collected boolean default false,
  p_event_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_record public.discovery_records%rowtype;
  v_from text;
  v_to text;
  v_event text;
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
  v_from := coalesce(v_record.raw_data->>'lifecycle_stage',
    case when v_record.status='new' then 'discovered' else 'reviewed' end);
  if v_from not in ('reviewed','collected') then
    raise exception 'Prospect must be reviewed before contact enrichment';
  end if;

  v_to := case when p_has_collected then 'collected' else v_from end;
  v_event := case when p_has_collected then 'prospect_collected' else 'prospect_collection_empty' end;

  update public.discovery_records
  set raw_data=coalesce(p_raw_data,'{}'::jsonb),
      email=coalesce(nullif(v_record.email,''),nullif(p_email,'')),
      phone=coalesce(nullif(v_record.phone,''),nullif(p_phone,'')),
      address=coalesce(nullif(v_record.address,''),nullif(p_address,'')),
      updated_at=v_now
  where id=p_record_id and owner_id=p_owner_id;

  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    p_owner_id,'prospect',p_record_id,v_event,v_from,v_to,
    false,'not_required',coalesce(v_uid,p_owner_id),
    case when p_has_collected then '联系人信息采集成功' else '本次未找到可用联系方式，保留在待采集阶段' end,
    coalesce(p_event_payload,'{}'::jsonb)||jsonb_build_object('atomic',true)
  );

  return jsonb_build_object('id',p_record_id,'lifecycleStage',v_to);
end;
$$;

revoke all on function public.record_prospect_contact_enrichment(uuid,uuid,jsonb,text,text,text,boolean,jsonb) from public, anon;
grant execute on function public.record_prospect_contact_enrichment(uuid,uuid,jsonb,text,text,text,boolean,jsonb) to authenticated, service_role;
