create or replace function public.capture_trade_payment_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_note text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_note := case new.status
    when 'confirmed' then '收款已确认'
    when 'partially_reconciled' then '收款部分核销或部分退款'
    when 'reconciled' then '收款已全部核销'
    when 'voided' then coalesce(nullif(new.void_reason,''),'收款已作废')
    when 'returned' then '退款或退回已过账'
    else '收款状态变更'
  end;

  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    new.owner_id,'payment',new.id,'payment_status_changed',old.status,new.status,
    false,'not_required',coalesce(v_actor,new.updated_by,new.created_by),
    v_note,
    jsonb_build_object(
      'payment_type',new.payment_type,
      'reconcile_status',new.reconcile_status,
      'allocated_total',new.allocated_total,
      'unallocated_amount',new.unallocated_amount,
      'atomic',true
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_trade_payment_lifecycle_event on public.trade_payments;
create trigger trg_trade_payment_lifecycle_event
after update of status on public.trade_payments
for each row
when (old.status is distinct from new.status)
execute function public.capture_trade_payment_lifecycle_event();

create or replace function public.capture_trade_payment_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    new.owner_id,'payment',new.id,'payment_created',null,new.status,
    false,'not_required',coalesce(auth.uid(),new.created_by,new.owner_id),
    '收款记录已创建',
    jsonb_build_object('payment_type',new.payment_type,'payment_no',new.payment_no,'atomic',true)
  );
  return new;
end;
$$;

drop trigger if exists trg_trade_payment_created_lifecycle_event on public.trade_payments;
create trigger trg_trade_payment_created_lifecycle_event
after insert on public.trade_payments
for each row execute function public.capture_trade_payment_created_event();

create or replace function public.capture_trade_payment_reconciliation_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reconcile_status is not distinct from old.reconcile_status then
    return new;
  end if;

  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    new.owner_id,'payment',new.id,'payment_reconciliation_changed',old.reconcile_status,new.reconcile_status,
    false,'not_required',coalesce(auth.uid(),new.updated_by,new.owner_id),
    '核销状态：'||coalesce(old.reconcile_status,'未设置')||' → '||coalesce(new.reconcile_status,'未设置'),
    jsonb_build_object(
      'dimension','reconciliation',
      'from_reconcile_status',old.reconcile_status,
      'to_reconcile_status',new.reconcile_status,
      'payment_type',new.payment_type,
      'updated_by',new.updated_by,
      'atomic',true
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_trade_payment_reconciliation_lifecycle_event on public.trade_payments;
create trigger trg_trade_payment_reconciliation_lifecycle_event
after update on public.trade_payments
for each row when (
  old.reconcile_status is distinct from new.reconcile_status
)
execute function public.capture_trade_payment_reconciliation_event();
