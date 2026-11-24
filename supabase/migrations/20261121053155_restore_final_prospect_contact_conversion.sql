create or replace function public.finalize_prospect_contact_conversion(
  p_owner_id uuid,
  p_record_id uuid,
  p_lead_id uuid,
  p_account_id uuid,
  p_raw_data jsonb,
  p_event_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_record public.discovery_records%rowtype;
begin
  if v_uid is distinct from p_owner_id and coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Not authorized for this prospect';
  end if;

  select * into v_record
  from public.discovery_records
  where id=p_record_id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'Prospect not found or access denied'; end if;
  if v_record.status='promoted' and v_record.lead_id=p_lead_id then
    return jsonb_build_object('id',p_record_id,'status','promoted','leadId',p_lead_id,'alreadyConverted',true);
  end if;
  if v_record.status <> 'new' then
    raise exception 'Prospect is not eligible for conversion';
  end if;
  if coalesce(v_record.raw_data->>'lifecycle_stage','discovered') <> 'collected' then
    raise exception 'Prospect contact enrichment must be completed before conversion';
  end if;
  if not exists(
    select 1 from public.business_transition_events
    where owner_id=p_owner_id and record_type='prospect'
      and record_id=p_record_id and event_type='prospect_reviewed'
  ) then
    raise exception 'Prospect review approval is required before conversion';
  end if;
  if not exists(select 1 from public.leads where id=p_lead_id and owner_id=p_owner_id and discovery_record_id=p_record_id) then
    raise exception 'Converted CRM lead is missing or does not belong to this prospect';
  end if;
  if not exists(select 1 from public.crm_accounts where id=p_account_id and owner_id=p_owner_id) then
    raise exception 'Converted CRM customer is missing or does not belong to this lead';
  end if;

  update public.discovery_records
  set status='promoted',lead_id=p_lead_id,
      raw_data=coalesce(p_raw_data,'{}'::jsonb)
        || jsonb_build_object('lifecycle_stage','converted','lifecycle_updated_at',now()),
      updated_at=now()
  where id=p_record_id and owner_id=p_owner_id;

  insert into public.business_record_relations(
    owner_id,source_record_type,source_record_id,target_record_type,target_record_id,
    relation_type,created_by,metadata
  )
  select p_owner_id,'prospect',p_record_id,'lead',p_lead_id,'converted_to',coalesce(v_uid,p_owner_id),
    jsonb_build_object('conversion_method','contact_candidate_review','atomic',true)
  where not exists(
    select 1 from public.business_record_relations
    where owner_id=p_owner_id and source_record_type='prospect' and source_record_id=p_record_id
      and target_record_type='lead' and target_record_id=p_lead_id and relation_type='converted_to'
  );

  insert into public.business_record_relations(
    owner_id,source_record_type,source_record_id,target_record_type,target_record_id,
    relation_type,created_by,metadata
  )
  select p_owner_id,'prospect',p_record_id,'customer',p_account_id,'converted_to',coalesce(v_uid,p_owner_id),
    jsonb_build_object('conversion_method','contact_candidate_review','atomic',true)
  where not exists(
    select 1 from public.business_record_relations
    where owner_id=p_owner_id and source_record_type='prospect' and source_record_id=p_record_id
      and target_record_type='customer' and target_record_id=p_account_id and relation_type='converted_to'
  );

  insert into public.business_record_relations(
    owner_id,source_record_type,source_record_id,target_record_type,target_record_id,
    relation_type,created_by,metadata
  )
  select distinct p_owner_id,'prospect',p_record_id,'contact',c.id,'converted_to',coalesce(v_uid,p_owner_id),
    jsonb_build_object('conversion_method','contact_candidate_review','atomic',true)
  from jsonb_array_elements_text(coalesce(p_event_payload->'contact_ids','[]'::jsonb)) ids(contact_id)
  join public.crm_contacts c on c.id=ids.contact_id::uuid and c.owner_id=p_owner_id and c.account_id=p_account_id
  where not exists(
    select 1 from public.business_record_relations r
    where r.owner_id=p_owner_id and r.source_record_type='prospect' and r.source_record_id=p_record_id
      and r.target_record_type='contact' and r.target_record_id=c.id and r.relation_type='converted_to'
  );

  insert into public.business_record_relations(
    owner_id,source_record_type,source_record_id,target_record_type,target_record_id,
    relation_type,created_by,metadata
  )
  select distinct p_owner_id,'customer',p_account_id,'contact',c.id,'has_contact',coalesce(v_uid,p_owner_id),
    jsonb_build_object('conversion_method','contact_candidate_review','atomic',true)
  from jsonb_array_elements_text(coalesce(p_event_payload->'contact_ids','[]'::jsonb)) ids(contact_id)
  join public.crm_contacts c on c.id=ids.contact_id::uuid and c.owner_id=p_owner_id and c.account_id=p_account_id
  where not exists(
    select 1 from public.business_record_relations r
    where r.owner_id=p_owner_id and r.source_record_type='customer' and r.source_record_id=p_account_id
      and r.target_record_type='contact' and r.target_record_id=c.id and r.relation_type='has_contact'
  );

  update public.business_transition_events
  set payload=coalesce(payload,'{}'::jsonb)||coalesce(p_event_payload,'{}'::jsonb),
      note=coalesce(note,'潜客已转化为 CRM 客户')||'；新增联系人 '||coalesce(p_event_payload->>'created_contacts','0')||' 位，关联联系人 '||coalesce(p_event_payload->>'linked_contacts','0')||' 位'
  where owner_id=p_owner_id and record_type='prospect' and record_id=p_record_id
    and event_type='prospect_converted'
    and created_at=(select max(created_at) from public.business_transition_events
      where owner_id=p_owner_id and record_type='prospect' and record_id=p_record_id and event_type='prospect_converted');

  return jsonb_build_object('id',p_record_id,'status','promoted','lifecycleStage','converted','leadId',p_lead_id,'accountId',p_account_id);
end;
$$;

revoke all on function public.finalize_prospect_contact_conversion(uuid,uuid,uuid,uuid,jsonb,jsonb) from public, anon;
grant execute on function public.finalize_prospect_contact_conversion(uuid,uuid,uuid,uuid,jsonb,jsonb) to authenticated, service_role;
