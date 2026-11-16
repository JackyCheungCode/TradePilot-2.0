create or replace function public.confirm_sales_order_status_transition(
  p_order_id uuid,
  p_expected_status text,
  p_target_status text,
  p_reason text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_status text;
  v_metadata jsonb;
  v_so jsonb;
  v_schedule jsonb;
  v_total numeric;
  v_ratio numeric;
  v_schedule_amount numeric;
  v_item_count integer;
  v_now timestamptz := now();
  v_next_so jsonb;
  v_next_status text;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p_target_status not in ('confirmed','cancelled') then
    raise exception 'Unsupported sales order transition';
  end if;

  select status,coalesce(metadata,'{}'::jsonb)
    into v_next_status,v_metadata
  from public.trade_orders
  where id=p_order_id and owner_id=v_owner and order_type='sales'
  for update;

  if not found then raise exception 'Sales order not found or access denied'; end if;

  v_so := coalesce(v_metadata->'sales_order','{}'::jsonb);
  v_status := coalesce(nullif(v_so->>'order_status',''),
    case v_next_status when 'draft' then 'draft' when 'active' then 'confirmed'
      when 'completed' then 'completed' when 'cancelled' then 'cancelled' else v_next_status end);

  if v_status is distinct from p_expected_status then
    raise exception 'Sales order status changed; reload before confirming';
  end if;

  if p_target_status='confirmed' then
    if v_status<>'draft' then raise exception 'Only draft orders can be confirmed'; end if;
    if coalesce(v_so->'settings_snapshot'->'order'->>'requireApproval','false')='true' then
      raise exception 'Order approval workflow is required but not configured';
    end if;
    v_schedule := coalesce(v_so->'payment_schedule','[]'::jsonb);
    select coalesce(sum((x->>'ratio')::numeric),0),coalesce(sum((x->>'amount')::numeric),0)
      into v_ratio,v_schedule_amount
    from jsonb_array_elements(v_schedule) x;
    v_total := coalesce((v_so->'totals'->>'grand_total')::numeric,0);
    if abs(v_ratio-100)>0.01 or abs(v_schedule_amount-v_total)>0.02 then
      raise exception 'Payment schedule must total 100 percent and equal the order total';
    end if;
    select count(*) into v_item_count from public.trade_order_items
      where order_id=p_order_id and owner_id=v_owner and coalesce(line_type,'product')='product'
        and coalesce(line_status,'')<>'cancelled';
    if v_item_count<1 then raise exception 'At least one active product line is required'; end if;
    if coalesce(v_so->'form'->>'incoterm_place','')='' or
       coalesce(v_so->'form'->>'transport_mode','')='' or
       coalesce(v_so->'form'->>'destination_country','')='' or
       coalesce(v_so->'form'->>'payment_method','')='' or
       coalesce(v_so->'form'->>'bank_account_id','')='' then
      raise exception 'Trade terms, transport, destination, payment method and bank account are required';
    end if;
  else
    if v_status<>'confirmed' then raise exception 'Only confirmed orders can be cancelled'; end if;
    if coalesce(v_so->'settings_snapshot'->'order'->>'allowCancelAfterConfirm','false')<>'true' then
      raise exception 'Settings prohibit cancellation after confirmation';
    end if;
    if coalesce(v_so->>'fulfillment_status','') in ('shipped','partially_shipped') then
      raise exception 'Orders with shipment records cannot be cancelled as a whole';
    end if;
    if coalesce((v_so->'totals'->>'paid_amount')::numeric,0)>0 then
      raise exception 'Refund recorded payments before cancelling the order';
    end if;
    if coalesce(trim(p_reason),'')='' then raise exception 'Cancellation reason is required'; end if;
  end if;

  v_next_so := v_so || jsonb_build_object(
    'order_status',p_target_status,
    'price_locked',case when p_target_status='confirmed' then true else coalesce((v_so->>'price_locked')::boolean,false) end,
    'confirmed_at',case when p_target_status='confirmed' then to_jsonb(v_now) else v_so->'confirmed_at' end,
    'cancel_reason',case when p_target_status='cancelled' then to_jsonb(trim(p_reason)) else 'null'::jsonb end,
    'cancelled_at',case when p_target_status='cancelled' then to_jsonb(v_now) else v_so->'cancelled_at' end,
    'change_log',coalesce(v_so->'change_log','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'at',v_now,'action',p_target_status,
      'reason',case when p_target_status='cancelled' then trim(p_reason) else '订单确认，商业快照锁定' end
    ))
  );

  update public.trade_orders
  set status=case when p_target_status='cancelled' then 'cancelled' else 'active' end,
      confirmed_at=case when p_target_status='confirmed' then v_now else confirmed_at end,
      locked_at=case when p_target_status='confirmed' then v_now else locked_at end,
      metadata=jsonb_set(v_metadata,'{sales_order}',v_next_so,true),
      updated_at=v_now
  where id=p_order_id and owner_id=v_owner;

  insert into public.trade_document_events(owner_id,order_id,event_type,payload)
  values(v_owner,p_order_id,'sales_order_'||p_target_status,
    jsonb_build_object('reason',case when p_target_status='cancelled' then trim(p_reason) else null end,'atomic',true));

  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    v_owner,'sales_order',p_order_id,'sales_order_status_changed',v_status,p_target_status,
    false,'not_required',v_owner,
    case when p_target_status='cancelled' then trim(p_reason) else '订单确认，商业快照锁定' end,
    jsonb_build_object('atomic',true)
  );

  return p_order_id;
end;
$$;

revoke all on function public.confirm_sales_order_status_transition(uuid,text,text,text) from public, anon;
grant execute on function public.confirm_sales_order_status_transition(uuid,text,text,text) to authenticated;
