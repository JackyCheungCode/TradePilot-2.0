
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
  v_order_business_status text;
begin
  select owner_id,account_id into v_payment_owner,v_payment_account
  from public.trade_payments where id=new.payment_id;
  if v_payment_owner is distinct from new.owner_id then
    raise exception '收款分配必须属于对应收款记录的所有者。';
  end if;
  select owner_id,crm_account_id,status,metadata #>> '{sales_order,order_status}'
  into v_order_owner,v_order_account,v_order_status,v_order_business_status
  from public.trade_orders where id=new.order_id;
  if v_order_owner is distinct from new.owner_id or v_order_account is distinct from v_payment_account then
    raise exception '收款分配订单必须属于当前收款客户。';
  end if;
  if v_order_status not in ('active','completed')
     and coalesce(v_order_business_status,'') not in ('confirmed','preparing','partially_shipped','shipped','completed') then
    raise exception '只能分配给已确认及之后状态的订单。';
  end if;
  return new;
end;
$$;

do $$
declare
  v_def text;
  v_old text := '    if v_order.status not in (''active'',''completed'') then';
  v_new text := '    v_order_business_status := v_order.metadata #>> ''{sales_order,order_status}'';' || E'\n' ||
    '    if v_order.status not in (''active'',''completed'') and coalesce(v_order_business_status,'''') not in (''confirmed'',''preparing'',''partially_shipped'',''shipped'',''completed'') then';
begin
  v_def := pg_get_functiondef('public.confirm_trade_payment(uuid)'::regprocedure);
  if position(v_old in v_def)=0 then raise exception '无法定位收款确认函数中的订单状态校验。'; end if;
  if position('v_order_business_status text;' in v_def)=0 then
    v_def := replace(v_def,'  v_order public.trade_orders%rowtype;','  v_order public.trade_orders%rowtype;' || E'\n' || '  v_order_business_status text;');
  end if;
  v_def := replace(v_def,v_old,v_new);
  execute v_def;
end;
$$;

revoke all on function public.enforce_trade_payment_allocation_ownership() from public;
