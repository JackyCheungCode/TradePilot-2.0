
create table if not exists public.trade_payment_reversals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  refund_payment_id uuid not null references public.trade_payments(id) on delete restrict,
  original_allocation_id uuid not null references public.trade_payment_allocations(id) on delete restrict,
  order_id uuid not null references public.trade_orders(id) on delete restrict,
  schedule_node_id text not null,
  reversed_amount numeric(20,6) not null check (reversed_amount > 0),
  reversed_amount_in_payment numeric(20,6) not null check (reversed_amount_in_payment > 0),
  created_at timestamptz not null default now()
);
create table if not exists public.trade_payment_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  payment_id uuid not null references public.trade_payments(id) on delete restrict,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists trade_payment_reversals_refund_idx on public.trade_payment_reversals(owner_id, refund_payment_id);
create index if not exists trade_payment_reversals_allocation_idx on public.trade_payment_reversals(owner_id, original_allocation_id);
create index if not exists trade_payment_events_payment_idx on public.trade_payment_events(owner_id, payment_id, created_at desc);

alter table public.trade_payment_reversals enable row level security;
alter table public.trade_payment_events enable row level security;
drop policy if exists trade_payment_reversals_select_own on public.trade_payment_reversals;
create policy trade_payment_reversals_select_own on public.trade_payment_reversals for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists trade_payment_reversals_insert_own on public.trade_payment_reversals;
create policy trade_payment_reversals_insert_own on public.trade_payment_reversals for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists trade_payment_events_select_own on public.trade_payment_events;
create policy trade_payment_events_select_own on public.trade_payment_events for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists trade_payment_events_insert_own on public.trade_payment_events;
create policy trade_payment_events_insert_own on public.trade_payment_events for insert to authenticated with check ((select auth.uid()) = owner_id);
grant select, insert on public.trade_payment_reversals to authenticated;
grant select, insert on public.trade_payment_events to authenticated;

create or replace function public.confirm_trade_payment(p_payment_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_payment public.trade_payments%rowtype;
  v_original public.trade_payments%rowtype;
  v_alloc public.trade_payment_allocations%rowtype;
  v_order public.trade_orders%rowtype;
  v_schedule jsonb;
  v_updated_schedule jsonb;
  v_node jsonb;
  v_node_index bigint;
  v_node_amount numeric;
  v_node_paid numeric;
  v_new_paid numeric;
  v_order_total numeric;
  v_order_paid numeric;
  v_order_outstanding numeric;
  v_allocated_payment numeric := 0;
  v_unallocated numeric := 0;
  v_refunded_before numeric := 0;
  v_refund_remaining numeric := 0;
  v_refund_available numeric := 0;
  v_reversed_payment numeric := 0;
  v_reversed_order numeric := 0;
  v_prior_payment numeric := 0;
  v_prior_order numeric := 0;
  v_remaining_payment numeric := 0;
  v_remaining_order numeric := 0;
  v_take_payment numeric := 0;
  v_take_order numeric := 0;
  v_idx bigint;
  v_is_deposit boolean := false;
  v_now timestamptz := now();
  v_status text;
  v_reconcile text;
  v_meta jsonb;
begin
  if v_uid is null then raise exception '需要登录后才能确认收款。'; end if;
  select * into v_payment
  from public.trade_payments
  where id = p_payment_id and owner_id = v_uid
  for update;
  if not found then raise exception '收款记录不存在或无权访问。'; end if;
  if v_payment.status not in ('draft','pending_confirmation') then
    raise exception '只有草稿或待确认收款可以过账。';
  end if;
  if v_payment.received_date is not null and v_payment.received_date > current_date then
    raise exception '到账日期不得晚于今天。';
  end if;
  if v_payment.net_received <= 0 or v_payment.net_received > v_payment.amount then
    raise exception '实际入账金额必须大于 0 且不得超过汇款金额。';
  end if;
  if v_payment.is_third_party and (v_payment.payer_relation is null or coalesce(v_payment.bank_slip,'') = '') then
    raise exception '第三方付款必须声明付款关系并上传或关联银行水单。';
  end if;
  if v_payment.payment_method = 'L/C' then
    if coalesce(v_payment.lc_no,'') = '' then raise exception 'L/C 收款必须填写信用证号。'; end if;
    if v_payment.lc_type = '远期' then
      if v_payment.usance_days is null or v_payment.acceptance_date is null then
        raise exception '远期 L/C 必须填写远期天数和承兑日期。';
      end if;
      if v_payment.maturity_date is distinct from (v_payment.acceptance_date + v_payment.usance_days) then
        raise exception 'L/C 到期日必须等于承兑日期加远期天数。';
      end if;
    end if;
    if v_payment.discrepancy_status = '已提出' then raise exception 'L/C 不符点已提出，暂不能核销。'; end if;
  end if;
  if v_payment.diff_amount <> 0 and (v_payment.diff_reason is null or v_payment.diff_handling is null) then
    raise exception '存在差异时必须填写差异原因和处理方式。';
  end if;
  if v_payment.diff_handling = '坏账核销' and coalesce(v_payment.diff_note,'') = '' then
    raise exception '坏账核销必须填写差异说明。';
  end if;

  if v_payment.payment_type = 'refund' then
    if v_payment.original_payment_id is null or v_payment.refund_amount is null or v_payment.refund_amount <= 0 then
      raise exception '退款必须关联原收款并填写正数退款金额。';
    end if;
    select * into v_original
    from public.trade_payments
    where id = v_payment.original_payment_id and owner_id = v_uid
    for update;
    if not found or v_original.payment_type <> 'receipt' or v_original.status in ('voided','returned') then
      raise exception '原收款不存在、已作废或已全部退回。';
    end if;
    if v_original.account_id <> v_payment.account_id or v_original.currency <> v_payment.currency then
      raise exception '退款客户和币种必须与原收款一致。';
    end if;
    select coalesce(sum(refund_amount),0) into v_refunded_before
    from public.trade_payments
    where original_payment_id = v_original.id
      and payment_type = 'refund'
      and status in ('confirmed','partially_reconciled','reconciled','returned');
    v_refund_available := greatest(0, v_original.net_received - v_refunded_before);
    if v_payment.refund_amount > v_refund_available then
      raise exception '退款金额超过原收款可退余额。可退余额：%', v_refund_available;
    end if;
    v_refund_remaining := v_payment.refund_amount;

    for v_alloc in
      select * from public.trade_payment_allocations
      where payment_id = v_original.id and owner_id = v_uid
      order by created_at, id
    loop
      exit when v_refund_remaining <= 0.000001;
      select coalesce(sum(reversed_amount_in_payment),0), coalesce(sum(reversed_amount),0)
      into v_prior_payment, v_prior_order
      from public.trade_payment_reversals
      where original_allocation_id = v_alloc.id and owner_id = v_uid;
      v_remaining_payment := greatest(0, v_alloc.allocated_amount_in_payment - v_prior_payment);
      v_remaining_order := greatest(0, v_alloc.allocated_amount - v_prior_order);
      if v_remaining_payment <= 0.000001 or v_remaining_order <= 0.000001 then continue; end if;
      v_take_payment := least(v_remaining_payment, v_refund_remaining);
      v_take_order := least(v_remaining_order, v_remaining_order * v_take_payment / v_remaining_payment);

      select * into v_order
      from public.trade_orders
      where id = v_alloc.order_id and owner_id = v_uid
      for update;
      if not found then raise exception '原分配订单不存在或无权访问。'; end if;
      v_schedule := coalesce(v_order.metadata #> '{sales_order,payment_schedule}', '[]'::jsonb);
      select ordinality, value into v_node_index, v_node
      from jsonb_array_elements(v_schedule) with ordinality
      where value->>'id' = v_alloc.schedule_node_id
      limit 1;
      if v_node is null then raise exception '原分配收款节点已不存在，无法执行退款冲回。'; end if;
      v_node_amount := coalesce((v_node->>'amount')::numeric,0);
      v_node_paid := coalesce((v_node->>'paid_amount')::numeric,0);
      v_new_paid := greatest(0, v_node_paid - v_take_order);
      select jsonb_agg(
        case when ordinality = v_node_index then
          jsonb_set(jsonb_set(value,'{paid_amount}',to_jsonb(v_new_paid),true),'{status}',
            to_jsonb(case when v_new_paid >= v_node_amount - 0.005 then '已收齐' when v_new_paid > 0 then '部分收' else '未收' end),true)
        else value end order by ordinality
      ) into v_updated_schedule
      from jsonb_array_elements(v_schedule) with ordinality;
      v_meta := jsonb_set(v_order.metadata,'{sales_order,payment_schedule}',coalesce(v_updated_schedule,'[]'::jsonb),true);
      v_order_paid := 0;
      select coalesce(sum(coalesce((value->>'paid_amount')::numeric,0)),0) into v_order_paid
      from jsonb_array_elements(coalesce(v_updated_schedule,'[]'::jsonb));
      v_order_total := coalesce((v_meta #>> '{sales_order,totals,grand_total}')::numeric,0);
      v_order_outstanding := greatest(0,v_order_total-v_order_paid);
      v_meta := jsonb_set(v_meta,'{sales_order,totals,paid_amount}',to_jsonb(v_order_paid),true);
      v_meta := jsonb_set(v_meta,'{sales_order,totals,outstanding_amount}',to_jsonb(v_order_outstanding),true);
      v_meta := jsonb_set(v_meta,'{sales_order,payment_status}',to_jsonb(case when v_order_outstanding <= 0.005 then 'paid' when v_order_paid > 0 then 'partial' else 'unpaid' end),true);
      if coalesce(v_node->>'milestone','') ilike '%定金%' and v_new_paid < v_node_amount - 0.005 then
        v_meta := jsonb_set(v_meta,'{sales_order,delivery_block}', 'true'::jsonb,true);
        v_meta := jsonb_set(v_meta,'{sales_order,delivery_block_reason}',to_jsonb('定金退款后重新触发发货冻结'),true);
        v_meta := jsonb_set(v_meta,'{sales_order,change_log}',
          coalesce(v_meta #> '{sales_order,change_log}','[]'::jsonb) || jsonb_build_array(jsonb_build_object('at',v_now,'action','payment_refund_delivery_block','reason','定金退款后重新触发发货冻结')),true);
      end if;
      update public.trade_orders set metadata=v_meta, updated_at=v_now where id=v_order.id and owner_id=v_uid;
      insert into public.trade_payment_reversals(owner_id,refund_payment_id,original_allocation_id,order_id,schedule_node_id,reversed_amount,reversed_amount_in_payment)
      values(v_uid,v_payment.id,v_alloc.id,v_order.id,v_alloc.schedule_node_id,v_take_order,v_take_payment);
      v_refund_remaining := v_refund_remaining - v_take_payment;
      v_reversed_payment := v_reversed_payment + v_take_payment;
      v_reversed_order := v_reversed_order + v_take_order;
    end loop;

    select coalesce(sum(reversed_amount_in_payment),0) into v_allocated_payment
    from public.trade_payment_reversals
    where refund_payment_id = v_payment.id and owner_id = v_uid;
    v_status := case when v_refunded_before + v_payment.refund_amount >= v_original.net_received - 0.005 then 'returned' else 'partially_reconciled' end;
    update public.trade_payments
    set allocated_total = greatest(0,v_original.allocated_total-v_reversed_payment),
        unallocated_amount = greatest(0,(v_original.net_received-v_refunded_before-v_payment.refund_amount)-greatest(0,v_original.allocated_total-v_reversed_payment)),
        status = case when v_status='returned' then 'returned' else 'partially_reconciled' end,
        reconcile_status = case when greatest(0,v_original.allocated_total-v_reversed_payment) <= 0.005 then '未核销' when greatest(0,(v_original.net_received-v_refunded_before-v_payment.refund_amount)-greatest(0,v_original.allocated_total-v_reversed_payment)) > 0.005 then '部分核销' else '已核销' end,
        updated_at=v_now
    where id=v_original.id and owner_id=v_uid;
    update public.trade_payments
    set status='returned', confirmed_by=v_uid, confirmed_at=v_now, updated_by=v_uid, updated_at=v_now
    where id=v_payment.id and owner_id=v_uid;
    insert into public.trade_payment_events(owner_id,payment_id,event_type,payload)
    values(v_uid,v_payment.id,'refund_posted',jsonb_build_object('original_payment_id',v_original.id,'refund_amount',v_payment.refund_amount,'reversed_allocated_amount',v_reversed_order,'reversed_payment_amount',v_reversed_payment));
    return jsonb_build_object('success',true,'status','returned','reversed_allocated_amount',v_reversed_order);
  end if;

  select coalesce(sum(allocated_amount_in_payment),0) into v_allocated_payment
  from public.trade_payment_allocations
  where payment_id=v_payment.id and owner_id=v_uid;
  if v_allocated_payment > v_payment.net_received + 0.000001 then
    raise exception '分配金额超过实际入账金额。';
  end if;

  for v_alloc in
    select * from public.trade_payment_allocations
    where payment_id=v_payment.id and owner_id=v_uid
    order by created_at, id
  loop
    if v_alloc.schedule_node_id is null or v_alloc.schedule_node_id = '' then
      raise exception '每条分配必须选择订单收款计划节点。';
    end if;
    select * into v_order
    from public.trade_orders
    where id=v_alloc.order_id and owner_id=v_uid
    for update;
    if not found or v_order.crm_account_id is distinct from v_payment.account_id then
      raise exception '分配订单必须属于当前收款客户。';
    end if;
    if v_order.status not in ('active','completed') then
      raise exception '只能分配给已确认及之后状态的订单。';
    end if;
    v_schedule := coalesce(v_order.metadata #> '{sales_order,payment_schedule}', '[]'::jsonb);
    select ordinality, value into v_node_index, v_node
    from jsonb_array_elements(v_schedule) with ordinality
    where value->>'id' = v_alloc.schedule_node_id
    limit 1;
    if v_node is null then raise exception '所选收款计划节点不存在。'; end if;
    v_node_amount := coalesce((v_node->>'amount')::numeric,0);
    v_node_paid := coalesce((v_node->>'paid_amount')::numeric,0);
    if v_alloc.allocated_amount > greatest(0,v_node_amount-v_node_paid)+0.000001 then
      raise exception '分配金额超过订单节点未收金额。订单：%，节点：%，剩余：%',v_order.order_number,coalesce(v_node->>'milestone',''),greatest(0,v_node_amount-v_node_paid);
    end if;
    v_new_paid := v_node_paid + v_alloc.allocated_amount;
    select jsonb_agg(
      case when ordinality = v_node_index then
        jsonb_set(jsonb_set(value,'{paid_amount}',to_jsonb(v_new_paid),true),'{status}',
          to_jsonb(case when v_new_paid >= v_node_amount - 0.005 then '已收齐' else '部分收' end),true)
      else value end order by ordinality
    ) into v_updated_schedule
    from jsonb_array_elements(v_schedule) with ordinality;
    v_meta := jsonb_set(v_order.metadata,'{sales_order,payment_schedule}',coalesce(v_updated_schedule,'[]'::jsonb),true);
    v_order_paid := 0;
    select coalesce(sum(coalesce((value->>'paid_amount')::numeric,0)),0) into v_order_paid
    from jsonb_array_elements(coalesce(v_updated_schedule,'[]'::jsonb));
    v_order_total := coalesce((v_meta #>> '{sales_order,totals,grand_total}')::numeric,0);
    v_order_outstanding := greatest(0,v_order_total-v_order_paid);
    v_meta := jsonb_set(v_meta,'{sales_order,totals,paid_amount}',to_jsonb(v_order_paid),true);
    v_meta := jsonb_set(v_meta,'{sales_order,totals,outstanding_amount}',to_jsonb(v_order_outstanding),true);
    v_meta := jsonb_set(v_meta,'{sales_order,payment_status}',to_jsonb(case when v_order_outstanding <= 0.005 then 'paid' when v_order_paid > 0 then 'partial' else 'unpaid' end),true);
    if v_alloc.allocation_type='定金' and v_new_paid >= v_node_amount - 0.005 and coalesce((v_meta #>> '{sales_order,delivery_block}')::boolean,false) then
      v_meta := jsonb_set(v_meta,'{sales_order,delivery_block}','false'::jsonb,true);
      v_meta := jsonb_set(v_meta,'{sales_order,delivery_block_reason}','null'::jsonb,true);
      v_meta := jsonb_set(v_meta,'{sales_order,change_log}',
        coalesce(v_meta #> '{sales_order,change_log}','[]'::jsonb) || jsonb_build_array(jsonb_build_object('at',v_now,'action','payment_deposit_cleared','reason','定金节点收齐，自动解除发货冻结')),true);
    end if;
    update public.trade_orders set metadata=v_meta, updated_at=v_now where id=v_order.id and owner_id=v_uid;
    insert into public.trade_payment_events(owner_id,payment_id,event_type,payload)
    values(v_uid,v_payment.id,'allocation_posted',jsonb_build_object('order_id',v_order.id,'order_number',v_order.order_number,'schedule_node_id',v_alloc.schedule_node_id,'allocated_amount',v_alloc.allocated_amount));
  end loop;

  v_unallocated := greatest(0,v_payment.net_received-v_allocated_payment);
  v_status := case when v_allocated_payment <= 0.000001 then 'confirmed' when v_unallocated > 0.005 then 'partially_reconciled' else 'reconciled' end;
  v_reconcile := case when v_allocated_payment <= 0.000001 then '未核销' when v_unallocated > 0.005 then '部分核销' else '已核销' end;
  update public.trade_payments
  set status=v_status,reconcile_status=v_reconcile,allocated_total=v_allocated_payment,unallocated_amount=v_unallocated,
      confirmed_by=v_uid,confirmed_at=v_now,updated_by=v_uid,updated_at=v_now
  where id=v_payment.id and owner_id=v_uid;
  insert into public.trade_payment_events(owner_id,payment_id,event_type,payload)
  values(v_uid,v_payment.id,'payment_confirmed',jsonb_build_object('allocated_total',v_allocated_payment,'unallocated_amount',v_unallocated,'status',v_status));
  return jsonb_build_object('success',true,'status',v_status,'allocated_total',v_allocated_payment,'unallocated_amount',v_unallocated);
end;
$$;

revoke all on function public.confirm_trade_payment(uuid) from public;
grant execute on function public.confirm_trade_payment(uuid) to authenticated;
