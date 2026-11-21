
create or replace function public.allocate_confirmed_trade_payment(p_payment_id uuid,p_allocations jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_payment public.trade_payments%rowtype;
  v_order public.trade_orders%rowtype;
  v_item jsonb;
  v_schedule jsonb;
  v_updated jsonb;
  v_node jsonb;
  v_index bigint;
  v_order_status text;
  v_node_amount numeric;
  v_node_paid numeric;
  v_node_writeoff numeric;
  v_new_paid numeric;
  v_amount numeric;
  v_amount_payment numeric;
  v_total_payment numeric := 0;
  v_total_paid numeric;
  v_total_writeoff numeric;
  v_grand_total numeric;
  v_outstanding numeric;
  v_meta jsonb;
  v_now timestamptz := now();
  v_allocation_type text;
  v_order_id uuid;
  v_node_id text;
begin
  if v_uid is null then raise exception '需要登录后才能分配预收款。'; end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations)=0 then
    raise exception '至少添加一条收款分配。';
  end if;
  select * into v_payment from public.trade_payments
  where id=p_payment_id and owner_id=v_uid for update;
  if not found or v_payment.payment_type<>'receipt' or v_payment.status not in ('confirmed','partially_reconciled','reconciled') then
    raise exception '只有已确认的收款记录可以继续分配预收余额。';
  end if;
  if v_payment.discrepancy_status='已提出' then raise exception 'L/C 不符点已提出，暂不能分配核销。'; end if;

  select coalesce(sum((x->>'allocated_amount_in_payment')::numeric),0)
  into v_total_payment
  from jsonb_array_elements(p_allocations) as t(x);
  if v_total_payment<=0 or v_total_payment>v_payment.unallocated_amount+0.000001 then
    raise exception '新增分配超过未分配预收余额。当前可分配：%',v_payment.unallocated_amount;
  end if;

  for v_item in select value from jsonb_array_elements(p_allocations)
  loop
    v_order_id := (v_item->>'order_id')::uuid;
    v_node_id := v_item->>'schedule_node_id';
    v_amount := (v_item->>'allocated_amount')::numeric;
    v_amount_payment := (v_item->>'allocated_amount_in_payment')::numeric;
    v_allocation_type := coalesce(v_item->>'allocation_type','其他');
    if v_order_id is null or coalesce(v_node_id,'')='' or v_amount<=0 or v_amount_payment<=0 then
      raise exception '分配记录缺少订单、收款节点或有效金额。';
    end if;

    select * into v_order from public.trade_orders
    where id=v_order_id and owner_id=v_uid for update;
    if not found or v_order.crm_account_id is distinct from v_payment.account_id then
      raise exception '只能分配给同一客户的订单。';
    end if;
    v_order_status := v_order.metadata #>> '{sales_order,order_status}';
    if v_order.status not in ('active','completed')
       and coalesce(v_order_status,'') not in ('confirmed','preparing','partially_shipped','shipped','completed') then
      raise exception '只能分配给已确认及之后状态的订单。';
    end if;

    v_schedule := coalesce(v_order.metadata #> '{sales_order,payment_schedule}','[]'::jsonb);
    select ordinality,value into v_index,v_node
    from jsonb_array_elements(v_schedule) with ordinality
    where value->>'id'=v_node_id limit 1;
    if v_node is null then raise exception '所选订单收款节点不存在。'; end if;
    v_node_amount := coalesce((v_node->>'amount')::numeric,0);
    v_node_paid := coalesce((v_node->>'paid_amount')::numeric,0);
    v_node_writeoff := coalesce((v_node->>'writeoff_amount')::numeric,0);
    if v_amount > greatest(0,v_node_amount-v_node_paid-v_node_writeoff)+0.000001 then
      raise exception '分配金额超过收款节点未收余额。';
    end if;
    v_new_paid := v_node_paid+v_amount;
    select jsonb_agg(
      case when ordinality=v_index then
        jsonb_set(jsonb_set(value,'{paid_amount}',to_jsonb(v_new_paid),true),'{status}',
          to_jsonb(case when v_new_paid+v_node_writeoff>=v_node_amount-0.005 and v_node_writeoff>0 then '已核销差异' when v_new_paid+v_node_writeoff>=v_node_amount-0.005 then '已收齐' else '部分收' end),true)
      else value end order by ordinality
    ) into v_updated
    from jsonb_array_elements(v_schedule) with ordinality;

    v_meta := jsonb_set(v_order.metadata,'{sales_order,payment_schedule}',coalesce(v_updated,'[]'::jsonb),true);
    select coalesce(sum(coalesce((value->>'paid_amount')::numeric,0)),0),
           coalesce(sum(coalesce((value->>'writeoff_amount')::numeric,0)),0)
    into v_total_paid,v_total_writeoff from jsonb_array_elements(coalesce(v_updated,'[]'::jsonb));
    v_grand_total := coalesce((v_meta #>> '{sales_order,totals,grand_total}')::numeric,0);
    v_outstanding := greatest(0,v_grand_total-v_total_paid-v_total_writeoff);
    v_meta := jsonb_set(v_meta,'{sales_order,totals,paid_amount}',to_jsonb(v_total_paid),true);
    v_meta := jsonb_set(v_meta,'{sales_order,totals,writeoff_amount}',to_jsonb(v_total_writeoff),true);
    v_meta := jsonb_set(v_meta,'{sales_order,totals,outstanding_amount}',to_jsonb(v_outstanding),true);
    v_meta := jsonb_set(v_meta,'{sales_order,payment_status}',to_jsonb(case when v_outstanding<=0.005 then 'paid' when v_total_paid>0 then 'partial' else 'unpaid' end),true);
    if v_allocation_type='定金' and v_new_paid+v_node_writeoff>=v_node_amount-0.005 and coalesce((v_meta #>> '{sales_order,delivery_block}')::boolean,false) then
      v_meta := jsonb_set(v_meta,'{sales_order,delivery_block}','false'::jsonb,true);
      v_meta := jsonb_set(v_meta,'{sales_order,delivery_block_reason}','null'::jsonb,true);
      v_meta := jsonb_set(v_meta,'{sales_order,change_log}',coalesce(v_meta #> '{sales_order,change_log}','[]'::jsonb)||jsonb_build_array(jsonb_build_object('at',v_now,'action','payment_deposit_cleared','reason','定金节点收齐，自动解除发货冻结')),true);
    end if;
    update public.trade_orders set metadata=v_meta,updated_at=v_now where id=v_order.id and owner_id=v_uid;

    insert into public.trade_payment_allocations(owner_id,payment_id,order_id,schedule_node_id,allocation_type,allocated_amount,allocated_amount_in_payment,allocation_date)
    values(v_uid,v_payment.id,v_order.id,v_node_id,v_allocation_type,v_amount,v_amount_payment,coalesce((v_item->>'allocation_date')::date,current_date));
    insert into public.trade_payment_events(owner_id,payment_id,event_type,payload)
    values(v_uid,v_payment.id,'prepayment_allocated',jsonb_build_object('order_id',v_order.id,'order_number',v_order.order_number,'schedule_node_id',v_node_id,'allocated_amount',v_amount,'allocated_amount_in_payment',v_amount_payment));
  end loop;

  update public.trade_payments
  set allocated_total=allocated_total+v_total_payment,
      unallocated_amount=greatest(0,unallocated_amount-v_total_payment),
      status=case when unallocated_amount-v_total_payment<=0.005 then 'reconciled' else 'partially_reconciled' end,
      reconcile_status=case when unallocated_amount-v_total_payment<=0.005 then '已核销' else '部分核销' end,
      updated_by=v_uid,updated_at=v_now
  where id=v_payment.id and owner_id=v_uid;
  return jsonb_build_object('success',true,'allocated_amount',v_total_payment,'remaining_unallocated',greatest(0,v_payment.unallocated_amount-v_total_payment));
end;
$$;
revoke all on function public.allocate_confirmed_trade_payment(uuid,jsonb) from public;
grant execute on function public.allocate_confirmed_trade_payment(uuid,jsonb) to authenticated;
