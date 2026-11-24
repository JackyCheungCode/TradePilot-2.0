
drop policy if exists enterprise_profiles_select_own on public.enterprise_profiles;
create policy enterprise_profiles_select_own on public.enterprise_profiles
for select to authenticated
using ((select auth.uid()) = owner_id);
grant select on public.enterprise_profiles to authenticated;

create or replace function public.enforce_trade_payment_ownership()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_account uuid;
  v_base_currency text;
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
  select default_currency into v_base_currency
  from public.enterprise_profiles
  where owner_id=new.owner_id and is_default=true and is_archived=false
  order by created_at desc limit 1;
  v_base_currency := coalesce(v_base_currency,'USD');
  if new.currency = v_base_currency then
    new.exchange_rate := coalesce(new.exchange_rate,1);
    new.amount_base := new.net_received;
  else
    if new.exchange_rate is null or new.exchange_rate <= 0 then
      raise exception '收款币种不同于本位币（%），必须填写有效汇率。',v_base_currency;
    end if;
    new.amount_base := new.net_received * new.exchange_rate;
  end if;
  return new;
end;
$$;

drop trigger if exists trade_payments_enforce_ownership on public.trade_payments;
create trigger trade_payments_enforce_ownership
before insert or update of owner_id,account_id,contact_id,bank_account_id,original_payment_id,currency,exchange_rate,net_received
on public.trade_payments
for each row execute function public.enforce_trade_payment_ownership();
