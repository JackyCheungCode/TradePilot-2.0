create or replace function public.confirm_shipment_status_transition(
  p_shipment_id uuid,
  p_expected_status text,
  p_target_status text,
  p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_current text;
  v_next_index integer;
  v_current_index integer;
  v_steps text[] := array['draft','pending_booking','booked','loaded','customs_cleared','departed','in_transit','arrived','import_cleared','delivered'];
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  select status into v_current
  from public.trade_shipments
  where id=p_shipment_id and owner_id=v_owner
  for update;

  if not found then raise exception 'Shipment not found or access denied'; end if;
  if v_current is distinct from p_expected_status then
    raise exception 'Shipment status changed; reload before confirming';
  end if;
  if v_current=p_target_status then raise exception 'Shipment already has this status'; end if;

  if p_target_status='cancelled' then
    if coalesce(trim(p_reason),'')='' then raise exception 'Cancellation reason is required'; end if;
    if v_current not in ('draft','pending_booking','booked','loaded') then
      raise exception 'A shipment cannot be cancelled after departure; record an exception or arrange a return shipment';
    end if;
  else
    v_current_index := array_position(v_steps,v_current);
    v_next_index := array_position(v_steps,p_target_status);
    if v_current_index is null or v_next_index is null or v_next_index<>v_current_index+1 then
      raise exception 'Invalid shipment lifecycle transition: % -> %',v_current,p_target_status;
    end if;
  end if;

  update public.trade_shipments
  set status=p_target_status,
      cancel_reason=case when p_target_status='cancelled' then trim(p_reason) else cancel_reason end,
      updated_at=now()
  where id=p_shipment_id and owner_id=v_owner;

  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    v_owner,'shipment',p_shipment_id,'shipment_status_changed',v_current,p_target_status,
    false,'not_required',v_owner,
    case when p_target_status='cancelled' then trim(p_reason) else '发运阶段确认' end,
    jsonb_build_object('atomic',true,'source','shipment_detail')
  );

  return p_shipment_id;
end;
$$;

revoke all on function public.confirm_shipment_status_transition(uuid,text,text,text) from public, anon;
grant execute on function public.confirm_shipment_status_transition(uuid,text,text,text) to authenticated;
