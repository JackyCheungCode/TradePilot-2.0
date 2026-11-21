
create or replace function public.apply_trade_payment_shortfall_writeoff()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_alloc public.trade_payment_allocations%rowtype;
  v_order public.trade_orders%rowtype;
  v_schedule jsonb;
  v_updated jsonb;
  v_node jsonb;
  v_index bigint;
  v_amount numeric;
  v_paid numeric;
  v_written_off numeric;
  v_shortfall numeric;
  v_total_paid numeric;
  v_total_writeoff numeric;
  v_total numeric;
  v_outstanding numeric;
  v_meta jsonb;
  v_now timestamptz := now();
begin
  if old.status not in ('draft','pending_confirmation')
     or new.status not in ('confirmed','partially_reconciled','reconciled')
     or new.payment_type <> 'receipt'
     or new.diff_type <> '短收'
     or new.diff_amount <= 0
     or new.diff_handling not in ('计入手续费','计入汇兑损益','折让冲销','坏账核销') then
    return new;
  end if;

  for v_alloc in
    select * from public.trade_payment_allocations
    where payment_id=new.id and owner_id=new.owner_id
    order by created_at,id
  loop
    select * into v_order
    from public.trade_orders
    where id=v_alloc.order_id and owner_id=new.owner_id
    for update;
    if not found then raise exception '差异核销订单不存在。'; end if;

    v_schedule := coalesce(v_order.metadata #> '{sales_order,payment_schedule}','[]'::jsonb);
    select ordinality,value into v_index,v_node
    from jsonb_array_elements(v_schedule) with ordinality
    where value->>'id'=v_alloc.schedule_node_id
    limit 1;
    if v_node is null then raise exception '差异核销收款节点不存在。'; end if;

    v_amount := coalesce((v_node->>'amount')::numeric,0);
    v_paid := coalesce((v_node->>'paid_amount')::numeric,0);
    v_written_off := coalesce((v_node->>'writeoff_amount')::numeric,0);
    v_shortfall := greatest(0,v_amount-v_paid-v_written_off);
    if v_shortfall <= 0.005 then continue; end if;

    select jsonb_agg(
      case when ordinality=v_index then
        jsonb_set(
          jsonb_set(
            jsonb_set(value,'{writeoff_amount}',to_jsonb(v_written_off+v_shortfall),true),
            '{status}',to_jsonb(case when v_paid+v_written_off+v_shortfall >= v_amount-0.005 then '已核销差异' else '部分收' end),true
          ),
          '{writeoff_reason}',to_jsonb(new.diff_reason||' / '||new.diff_handling),true
        )
      else value end order by ordinality
    ) into v_updated
    from jsonb_array_elements(v_schedule) with ordinality;

    v_meta := jsonb_set(v_order.metadata,'{sales_order,payment_schedule}',coalesce(v_updated,'[]'::jsonb),true);
    select coalesce(sum(coalesce((value->>'paid_amount')::numeric,0)),0),
           coalesce(sum(coalesce((value->>'writeoff_amount')::numeric,0)),0)
    into v_total_paid,v_total_writeoff
    from jsonb_array_elements(coalesce(v_updated,'[]'::jsonb));
    v_total := coalesce((v_meta #>> '{sales_order,totals,grand_total}')::numeric,0);
    v_outstanding := greatest(0,v_total-v_total_paid-v_total_writeoff);
    v_meta := jsonb_set(v_meta,'{sales_order,totals,paid_amount}',to_jsonb(v_total_paid),true);
    v_meta := jsonb_set(v_meta,'{sales_order,totals,writeoff_amount}',to_jsonb(v_total_writeoff),true);
    v_meta := jsonb_set(v_meta,'{sales_order,totals,outstanding_amount}',to_jsonb(v_outstanding),true);
    v_meta := jsonb_set(v_meta,'{sales_order,payment_status}',to_jsonb(case when v_outstanding<=0.005 then 'paid' when v_total_paid>0 then 'partial' else 'unpaid' end),true);

    if coalesce(v_node->>'milestone','') ilike '%定金%'
       and v_paid+v_written_off+v_shortfall >= v_amount-0.005
       and coalesce((v_meta #>> '{sales_order,delivery_block}')::boolean,false) then
      v_meta := jsonb_set(v_meta,'{sales_order,delivery_block}','false'::jsonb,true);
      v_meta := jsonb_set(v_meta,'{sales_order,delivery_block_reason}','null'::jsonb,true);
      v_meta := jsonb_set(v_meta,'{sales_order,change_log}',
        coalesce(v_meta #> '{sales_order,change_log}','[]'::jsonb)||
        jsonb_build_array(jsonb_build_object('at',v_now,'action','payment_deposit_difference_cleared','reason','定金差异已核销，自动解除发货冻结')),true);
    end if;

    update public.trade_orders set metadata=v_meta,updated_at=v_now
    where id=v_order.id and owner_id=new.owner_id;
    insert into public.trade_payment_events(owner_id,payment_id,event_type,payload)
    values(new.owner_id,new.id,'payment_difference_written_off',
      jsonb_build_object('order_id',v_order.id,'schedule_node_id',v_alloc.schedule_node_id,'amount',v_shortfall,'reason',new.diff_reason,'handling',new.diff_handling));
  end loop;
  return new;
end;
$$;

drop trigger if exists trade_payments_apply_shortfall_writeoff on public.trade_payments;
create trigger trade_payments_apply_shortfall_writeoff
after update of status on public.trade_payments
for each row execute function public.apply_trade_payment_shortfall_writeoff();

revoke all on function public.apply_trade_payment_shortfall_writeoff() from public;
