
do $$
declare
  v_def text;
  v_old text := '  elsif old.metadata #>> ''{sales_order,order_status}''=''completed''' || E'\n' || '     and v_payment_status<>''paid'' then';
  v_new text := '  elsif old.metadata #>> ''{sales_order,order_status}''=''completed''' || E'\n' || '     and v_order_status=''completed''' || E'\n' || '     and v_payment_status<>''paid'' then';
begin
  v_def := pg_get_functiondef('public.sync_trade_order_completion_from_payment()'::regprocedure);
  if position(v_old in v_def)=0 then raise exception '无法定位订单完成回滚条件。'; end if;
  execute replace(v_def,v_old,v_new);
end;
$$;
