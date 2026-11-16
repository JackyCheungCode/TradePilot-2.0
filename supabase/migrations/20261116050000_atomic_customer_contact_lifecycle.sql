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
  v_fields jsonb;
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

create or replace function public.capture_customer_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := coalesce(nullif(new.custom_fields->>'customerStatus',''),
    case new.status when 'inactive' then 'dormant' when 'blocked' then 'blacklist'
      when 'unqualified' then 'lost' else 'active' end);
begin
  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    new.owner_id,'customer',new.id,'customer_created',null,v_status,
    false,'not_required',coalesce(auth.uid(),new.owner_id),
    '客户档案已创建',
    jsonb_build_object('atomic',true)
  );
  return new;
end;
$$;

drop trigger if exists trg_customer_created_lifecycle_event on public.crm_accounts;
create trigger trg_customer_created_lifecycle_event
after insert on public.crm_accounts
for each row execute function public.capture_customer_created_event();

create or replace function public.capture_contact_created_event()
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
    new.owner_id,'contact',new.id,'contact_created',null,
    case when new.is_active then 'active' else 'inactive' end,
    false,'not_required',coalesce(auth.uid(),new.owner_id),
    '联系人档案已创建',
    jsonb_build_object('atomic',true)
  );
  return new;
end;
$$;

drop trigger if exists trg_contact_created_lifecycle_event on public.crm_contacts;
create trigger trg_contact_created_lifecycle_event
after insert on public.crm_contacts
for each row execute function public.capture_contact_created_event();

create or replace function public.capture_contact_preference_change_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.do_not_contact is not distinct from old.do_not_contact then return new; end if;
  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    new.owner_id,'contact',new.id,'contact_contact_preference_changed',
    case when old.do_not_contact then 'do_not_contact' else 'contact_allowed' end,
    case when new.do_not_contact then 'do_not_contact' else 'contact_allowed' end,
    false,'not_required',coalesce(auth.uid(),new.owner_id),
    case when new.do_not_contact then '已设置拒绝联系' else '已恢复允许联系' end,
    jsonb_build_object('dimension','contact_permission','atomic',true)
  );
  return new;
end;
$$;

drop trigger if exists trg_contact_preference_lifecycle_event on public.crm_contacts;
create trigger trg_contact_preference_lifecycle_event
after update of do_not_contact on public.crm_contacts
for each row when (old.do_not_contact is distinct from new.do_not_contact)
execute function public.capture_contact_preference_change_event();

create or replace function public.capture_contact_employment_status_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status text := coalesce(nullif(old.custom_fields->>'status',''),'unknown');
  v_new_status text := coalesce(nullif(new.custom_fields->>'status',''),'unknown');
begin
  if v_old_status is not distinct from v_new_status then return new; end if;
  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    new.owner_id,'contact',new.id,'contact_employment_status_changed',
    v_old_status,v_new_status,false,'not_required',coalesce(auth.uid(),new.owner_id),
    '联系人任职状态已更新',
    jsonb_build_object('dimension','employment_status','atomic',true)
  );
  return new;
end;
$$;

drop trigger if exists trg_contact_employment_status_event on public.crm_contacts;
create trigger trg_contact_employment_status_event
after update of custom_fields on public.crm_contacts
for each row when (
  coalesce(old.custom_fields->>'status','unknown') is distinct from
  coalesce(new.custom_fields->>'status','unknown')
)
execute function public.capture_contact_employment_status_event();

create or replace function public.capture_contact_method_verification_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text;
  v_to text;
begin
  if tg_op = 'INSERT' then
    if not new.is_verified then return new; end if;
    v_from := 'unverified';
    v_to := 'verified';
  else
    if new.is_verified is not distinct from old.is_verified then return new; end if;
    v_from := case when old.is_verified then 'verified' else 'unverified' end;
    v_to := case when new.is_verified then 'verified' else 'unverified' end;
  end if;

  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    new.owner_id,'contact',new.contact_id,'contact_method_verification_changed',
    v_from,v_to,false,'not_required',coalesce(auth.uid(),new.owner_id),
    case when new.is_verified then '联系方式验证通过' else '联系方式验证状态已撤销' end,
    jsonb_build_object('dimension','contact_method_verification','method_type',new.method_type,'platform',new.platform,'atomic',true)
  );
  return new;
end;
$$;

drop trigger if exists trg_contact_method_verification_event on public.crm_contact_methods;
create trigger trg_contact_method_verification_event
after insert or update on public.crm_contact_methods
for each row execute function public.capture_contact_method_verification_event();
