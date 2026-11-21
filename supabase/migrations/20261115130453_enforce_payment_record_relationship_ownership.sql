
create or replace function public.enforce_trade_payment_ownership()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_account uuid;
begin
  select owner_id into v_owner from public.crm_accounts where id=new.account_id;
  if v_owner is distinct from new.owner_id then
    raise exception '收款客户必须属于当前用户。';
  end if;
  if new.contact_id is not null then
    select owner_id,account_id into v_owner,v_account from public.crm_contacts where id=new.contact_id;
    if v_owner is distinct from new.owner_id or v_account is distinct from new.account_id then
      raise exception '收款联系人必须属于所选客户。';
    end if;
  end if;
  select owner_id into v_owner from public.enterprise_bank_accounts where id=new.bank_account_id;
  if v_owner is distinct from new.owner_id then
    raise exception '我方收款账户必须属于当前用户。';
  end if;
  if new.original_payment_id is not null then
    select owner_id,account_id into v_owner,v_account from public.trade_payments where id=new.original_payment_id;
    if v_owner is distinct from new.owner_id or v_account is distinct from new.account_id then
      raise exception '原收款必须属于当前用户和同一客户。';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trade_payments_enforce_ownership on public.trade_payments;
create trigger trade_payments_enforce_ownership
before insert or update of owner_id,account_id,contact_id,bank_account_id,original_payment_id
on public.trade_payments
for each row execute function public.enforce_trade_payment_ownership();

create or replace function public.enforce_trade_payment_allocation_ownership()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_payment_owner uuid;
  v_payment_account uuid;
  v_order_owner uuid;
  v_order_account uuid;
  v_order_status text;
begin
  select owner_id,account_id into v_payment_owner,v_payment_account
  from public.trade_payments where id=new.payment_id;
  if v_payment_owner is distinct from new.owner_id then
    raise exception '收款分配必须属于对应收款记录的所有者。';
  end if;
  select owner_id,crm_account_id,status into v_order_owner,v_order_account,v_order_status
  from public.trade_orders where id=new.order_id;
  if v_order_owner is distinct from new.owner_id or v_order_account is distinct from v_payment_account then
    raise exception '收款分配订单必须属于当前收款客户。';
  end if;
  if v_order_status not in ('active','completed') then
    raise exception '只能分配给已确认及之后状态的订单。';
  end if;
  return new;
end;
$$;

drop trigger if exists trade_payment_allocations_enforce_ownership on public.trade_payment_allocations;
create trigger trade_payment_allocations_enforce_ownership
before insert or update of owner_id,payment_id,order_id
on public.trade_payment_allocations
for each row execute function public.enforce_trade_payment_allocation_ownership();

revoke all on function public.enforce_trade_payment_ownership() from public;
revoke all on function public.enforce_trade_payment_allocation_ownership() from public;
