
do $$
declare
  v_def text;
  v_old text := '    if v_payment.original_payment_id is null or v_payment.refund_amount is null or v_payment.refund_amount <= 0 then';
  v_new text := '    if v_payment.original_payment_id is null or v_payment.refund_amount is null or v_payment.refund_amount <= 0' ||
    ' or v_payment.refund_amount > v_payment.amount or v_payment.refund_amount > v_payment.net_received' ||
    ' or v_payment.refund_reason is null or v_payment.refund_date is null then';
begin
  v_def := pg_get_functiondef('public.confirm_trade_payment(uuid)'::regprocedure);
  if position(v_old in v_def)=0 then raise exception '无法定位退款金额校验。'; end if;
  execute replace(v_def,v_old,v_new);
end;
$$;
