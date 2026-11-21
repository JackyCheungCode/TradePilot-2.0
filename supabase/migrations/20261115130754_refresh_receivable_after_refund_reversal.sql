
create or replace function public.refresh_order_after_payment_reversal()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_order public.trade_orders%rowtype;
  v_schedule jsonb;
  v_updated jsonb;
  v_node jsonb;
  v_index bigint;
  v_amount numeric;
  v_paid numeric;
  v_writeoff numeric;
  v_total_paid numeric;
  v_total_writeoff numeric;
  v_total numeric;
  v_outstanding numeric;
  v_meta jsonb;
  v_deposit boolean;
  v_now timestamptz := now();
begin
  select * into v_order
  from public.trade_orders
  where id=new.order_id and owner_id=new.owner_id
  for update;
  if not found then raise exception '退款冲回订单不存在。'; end if;
  v_schedule := coalesce(v_order.metadata #> '{sales_order,payment_schedule}','[]'::jsonb);
  select ordinality,value into v_index,v_node
  from jsonb_array_elements(v_schedule) with ordinality
  where value->>'id'=new.schedule_node_id
  limit 1;
  if v_node is null then raise exception '退款冲回收款节点不存在。'; end if;
  v_amount := coalesce((v_node->>'amount')::numeric,0);
  v_paid := coalesce((v_node->>'paid_amount')::numeric,0);
  v_writeoff := coalesce((v_node->>'writeoff_amount')::numeric,0);
  v_deposit := coalesce(v_node->>'milestone',v_node->>'node_name','') ilike '%定金%';

  select jsonb_agg(
    case when ordinality=v_index then
      jsonb_set(value,'{status}',
        to_jsonb(case
          when v_paid+v_writeoff >= v_amount-0.005 and v_writeoff>0 then '已核销差异'
          when v_paid+v_writeoff >= v_amount-0.005 then '已收齐'
          when v_paid>0 then '部分收'
          else '未收'
        end),true)
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

  if v_deposit and v_paid+v_writeoff < v_amount-0.005 then
    v_meta := jsonb_set(v_meta,'{sales_order,delivery_block}','true'::jsonb,true);
    v_meta := jsonb_set(v_meta,'{sales_order,delivery_block_reason}',to_jsonb('定金退款后重新触发发货冻结'),true);
    v_meta := jsonb_set(v_meta,'{sales_order,change_log}',
      coalesce(v_meta #> '{sales_order,change_log}','[]'::jsonb)||
      jsonb_build_array(jsonb_build_object('at',v_now,'action','payment_refund_delivery_block','reason','定金退款后重新触发发货冻结')),true);
  end if;

  update public.trade_orders set metadata=v_meta,updated_at=v_now
  where id=v_order.id and owner_id=new.owner_id;
  return new;
end;
$$;

drop trigger if exists trade_payment_reversals_refresh_order on public.trade_payment_reversals;
create trigger trade_payment_reversals_refresh_order
after insert on public.trade_payment_reversals
for each row execute function public.refresh_order_after_payment_reversal();

revoke all on function public.refresh_order_after_payment_reversal() from public;
