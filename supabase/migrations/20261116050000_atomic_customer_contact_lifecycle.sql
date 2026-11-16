create or replace function public.confirm_customer_status_transition(
  p_customer_id uuid,
  p_expected_status text,
  p_target_status text,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_status text;
  v_db_status text;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if coalesce(trim(p_note),'') = '' then raise exception 'Status change reason is required'; end if;
  if p_target_status not in ('active','dormant','lost','blacklist') then
    raise exception 'Unsupported customer status';
  end if;

  select status, coalesce(custom_fields,'{}'::jsonb)
    into v_db_status, v_fields
  from public.crm_accounts
  where id = p_customer_id and owner_id = v_owner and is_archived = false
  for update;

  if not found then raise exception 'Customer not found or access denied'; end if;

  v_status := coalesce(nullif(v_fields->>'customerStatus',''),
    case v_db_status when 'inactive' then 'dormant' when 'blocked' then 'blacklist'
      when 'unqualified' then 'lost' else 'active' end);

  if v_status is distinct from p_expected_status then
    raise exception 'Customer status changed; reload and review before confirming';
  end if;
  if v_status = p_target_status then raise exception 'Customer already has this status'; end if;

  update public.crm_accounts
  set status = case p_target_status when 'active' then 'active' when 'dormant' then 'inactive'
      when 'lost' then 'unqualified' when 'blacklist' then 'blocked' end,
      custom_fields = jsonb_set(v_fields,'{customerStatus}',to_jsonb(p_target_status),true),
      updated_at = now()
  where id = p_customer_id and owner_id = v_owner;

  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    v_owner,'customer',p_customer_id,'customer_status_changed',v_status,p_target_status,
    false,'not_required',v_owner,trim(p_note),
    jsonb_build_object('source','customer_detail','atomic',true)
  );

  return p_customer_id;
end;
$$;

create or replace function public.confirm_contact_active_transition(
  p_contact_id uuid,
  p_expected_active boolean,
  p_target_active boolean,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_current_active boolean;
  v_fields jsonb;
  v_from_status text;
  v_to_status text;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if coalesce(trim(p_note),'') = '' then raise exception 'Status change reason is required'; end if;
  if p_expected_active = p_target_active then raise exception 'Contact already has this status'; end if;

  select is_active
    into v_current_active
  from public.crm_contacts
  where id = p_contact_id and owner_id = v_owner and is_archived = false
  for update;

  if not found then raise exception 'Contact not found or access denied'; end if;
  if v_current_active is distinct from p_expected_active then
    raise exception 'Contact status changed; reload and review before confirming';
  end if;

  v_from_status := case when v_current_active then 'active' else 'inactive' end;
  v_to_status := case when p_target_active then 'active' else 'inactive' end;

  update public.crm_contacts
  set is_active = p_target_active,
      updated_at = now()
  where id = p_contact_id and owner_id = v_owner;

  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    v_owner,'contact',p_contact_id,'contact_status_changed',v_from_status,v_to_status,
    false,'not_required',v_owner,trim(p_note),
    jsonb_build_object('source','contact_detail','atomic',true)
  );

  return p_contact_id;
end;
$$;

revoke all on function public.confirm_customer_status_transition(uuid,text,text,text) from public, anon;
revoke all on function public.confirm_contact_active_transition(uuid,boolean,boolean,text) from public, anon;
grant execute on function public.confirm_customer_status_transition(uuid,text,text,text) to authenticated;
grant execute on function public.confirm_contact_active_transition(uuid,boolean,boolean,text) to authenticated;
