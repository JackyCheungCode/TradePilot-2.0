
create or replace function public.enforce_trade_payment_allocation_ownership()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_payment_owner uuid;
  v_payment_account uuid;
  v_payment_bank_account uuid;
  v_order_owner uuid;
  v_order_account uuid;
  v_order_status text;
  v_order_business_status text;
  v_order_bank_account uuid;
begin
  select owner_id,account_id,bank_account_id into v_payment_owner,v_payment_account,v_payment_bank_account
  from public.trade_payments where id=new.payment_id;
  if v_payment_owner is distinct from new.owner_id then
    raise exception '收款分配必须属于对应收款记录的所有者。';
  end if;
  select owner_id,crm_account_id,status,metadata #>> '{sales_order,order_status}',
         nullif(metadata #>> '{sales_order,form,bank_account_id}','')::uuid
  into v_order_owner,v_order_account,v_order_status,v_order_business_status,v_order_bank_account
  from public.trade_orders where id=new.order_id;
  if v_order_owner is distinct from new.owner_id or v_order_account is distinct from v_payment_account then
    raise exception '收款分配订单必须属于当前收款客户。';
  end if;
  if v_order_status not in ('active','completed')
     and coalesce(v_order_business_status,'') not in ('confirmed','preparing','partially_shipped','shipped','completed') then
    raise exception '只能分配给已确认及之后状态的订单。';
  end if;
  if v_order_bank_account is not null and v_order_bank_account is distinct from v_payment_bank_account then
    raise exception '收款账户必须与订单指定的收款账户一致。';
  end if;
  return new;
end;
$$;

do $$
declare
  v_def text;
  v_old text := '  v_order public.trade_orders%rowtype;';
  v_new text := '  v_order public.trade_orders%rowtype;' || E'\n' || '  v_order_bank_account uuid;';
  v_check_old text := '    if not found or v_order.crm_account_id is distinct from v_payment.account_id then' || E'\n' ||
    '      raise exception ''分配订单必须属于当前收款客户。'';' || E'\n' || '    end if;';
  v_check_new text := v_check_old || E'\n' ||
    '    v_order_bank_account := nullif(v_order.metadata #>> ''{sales_order,form,bank_account_id}'','''')::uuid;' || E'\n' ||
    '    if v_order_bank_account is not null and v_order_bank_account is distinct from v_payment.bank_account_id then' || E'\n' ||
    '      raise exception ''收款账户必须与订单指定的收款账户一致。'';' || E'\n' || '    end if;';
begin
  v_def := pg_get_functiondef('public.confirm_trade_payment(uuid)'::regprocedure);
  if position(v_old in v_def)=0 then raise exception '无法定位收款确认函数声明。'; end if;
  if position('v_order_bank_account uuid;' in v_def)=0 then v_def:=replace(v_def,v_old,v_new); end if;
  if position(v_check_old in v_def)=0 then raise exception '无法定位收款确认订单客户校验。'; end if;
  v_def:=replace(v_def,v_check_old,v_check_new);
  execute v_def;
end;
$$;

do $$
declare
  v_def text;
  v_old text := '    if not found or v_order.crm_account_id is distinct from v_payment.account_id then' || E'\n' ||
    '      raise exception ''只能分配给同一客户的订单。'';' || E'\n' || '    end if;';
  v_new text := v_old || E'\n' ||
    '    if nullif(v_order.metadata #>> ''{sales_order,form,bank_account_id}'','''') is not null' || E'\n' ||
    '       and nullif(v_order.metadata #>> ''{sales_order,form,bank_account_id}'','''')::uuid is distinct from v_payment.bank_account_id then' || E'\n' ||
    '      raise exception ''收款账户必须与订单指定的收款账户一致。'';' || E'\n' || '    end if;';
begin
  v_def := pg_get_functiondef('public.allocate_confirmed_trade_payment(uuid,jsonb)'::regprocedure);
  if position(v_old in v_def)=0 then raise exception '无法定位预收分配客户校验。'; end if;
  execute replace(v_def,v_old,v_new);
end;
$$;

revoke all on function public.enforce_trade_payment_allocation_ownership() from public;
