
create or replace function public.sync_trade_order_completion_from_payment()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_so jsonb;
  v_payment_status text;
  v_fulfillment_status text;
  v_invoice_status text;
  v_order_status text;
  v_next_status text;
  v_next_metadata jsonb;
begin
  v_so := coalesce(new.metadata->'sales_order','{}'::jsonb);
  v_payment_status := coalesce(v_so->>'payment_status','');
  v_fulfillment_status := coalesce(v_so->>'fulfillment_status','');
  v_invoice_status := coalesce(v_so->>'invoice_status','');
  v_order_status := coalesce(v_so->>'order_status','');

  if v_payment_status='paid'
     and v_fulfillment_status in ('shipped','delivered')
     and v_invoice_status='invoiced'
     and v_order_status<>'completed' then
    v_next_metadata := jsonb_set(new.metadata,'{sales_order,order_status}','"completed"'::jsonb,true);
    update public.trade_orders set status='completed',metadata=v_next_metadata,updated_at=now()
    where id=new.id and owner_id=new.owner_id;
  elsif old.metadata #>> '{sales_order,order_status}'='completed'
     and v_payment_status<>'paid' then
    v_next_status := case when v_fulfillment_status in ('shipped','delivered') then v_fulfillment_status else 'confirmed' end;
    v_next_metadata := jsonb_set(new.metadata,'{sales_order,order_status}',to_jsonb(v_next_status),true);
    update public.trade_orders set status='active',metadata=v_next_metadata,updated_at=now()
    where id=new.id and owner_id=new.owner_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trade_orders_sync_completion_from_payment on public.trade_orders;
create trigger trade_orders_sync_completion_from_payment
after update of metadata on public.trade_orders
for each row
when (new.metadata is distinct from old.metadata)
execute function public.sync_trade_order_completion_from_payment();

revoke all on function public.sync_trade_order_completion_from_payment() from public;
