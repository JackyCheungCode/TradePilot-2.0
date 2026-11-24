
create or replace function public.void_trade_payment(p_payment_id uuid, p_reason text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_payment public.trade_payments%rowtype;
begin
  if v_uid is null then raise exception '需要登录后才能作废收款。'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception '作废必须填写原因。'; end if;
  select * into v_payment from public.trade_payments
  where id=p_payment_id and owner_id=v_uid for update;
  if not found then raise exception '收款记录不存在或无权访问。'; end if;
  if v_payment.status not in ('draft','pending_confirmation') then
    raise exception '已确认或已核销的收款不能直接作废，请先建立退款 / 红冲记录。';
  end if;
  if v_payment.bank_reconciled then
    raise exception '已与银行对账的收款不能作废，只能通过红冲处理。';
  end if;
  if exists(select 1 from public.trade_payment_allocations where payment_id=v_payment.id and owner_id=v_uid) then
    raise exception '作废前请先移除所有收款分配。';
  end if;
  update public.trade_payments
  set status='voided',void_reason=trim(p_reason),updated_by=v_uid,updated_at=now()
  where id=v_payment.id and owner_id=v_uid;
  insert into public.trade_payment_events(owner_id,payment_id,event_type,payload)
  values(v_uid,v_payment.id,'payment_voided',jsonb_build_object('reason',trim(p_reason)));
  return jsonb_build_object('success',true,'status','voided');
end;
$$;
revoke all on function public.void_trade_payment(uuid,text) from public;
grant execute on function public.void_trade_payment(uuid,text) to authenticated;
