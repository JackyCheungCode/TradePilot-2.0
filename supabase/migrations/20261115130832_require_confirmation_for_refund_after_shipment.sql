
alter table public.trade_payments
add column if not exists refund_shipped_confirmed boolean not null default false;

create or replace function public.enforce_refund_shipped_confirmation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.payment_type='refund'
     and new.status='returned'
     and not new.refund_shipped_confirmed
     and exists (
       select 1
       from public.trade_payment_allocations a
       join public.trade_shipments s on s.order_id=a.order_id
       where a.payment_id=new.original_payment_id
         and a.owner_id=new.owner_id
         and s.owner_id=new.owner_id
         and s.status in ('loaded','departed','in_transit','arrived','import_cleared','delivered')
     ) then
    raise exception '原收款关联订单已有发运记录，退款前必须完成二次确认。';
  end if;
  return new;
end;
$$;

drop trigger if exists trade_payments_enforce_refund_shipped_confirmation on public.trade_payments;
create trigger trade_payments_enforce_refund_shipped_confirmation
before update of status on public.trade_payments
for each row execute function public.enforce_refund_shipped_confirmation();
revoke all on function public.enforce_refund_shipped_confirmation() from public;
