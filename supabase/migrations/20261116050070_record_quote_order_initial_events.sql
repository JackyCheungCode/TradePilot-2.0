create or replace function public.capture_quote_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.document_type <> 'quotation' then return new; end if;
  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    new.owner_id,'quote',new.id,'quote_created',null,new.status,
    false,'not_required',coalesce(auth.uid(),new.owner_id),
    '报价单已创建',
    jsonb_build_object('document_number',new.document_number,'atomic',true)
  );
  return new;
end;
$$;

drop trigger if exists trg_quote_created_lifecycle_event on public.trade_documents;
create trigger trg_quote_created_lifecycle_event
after insert on public.trade_documents
for each row when (new.document_type='quotation')
execute function public.capture_quote_created_event();

create or replace function public.capture_sales_order_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.order_type <> 'sales' then return new; end if;
  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    new.owner_id,'sales_order',new.id,'sales_order_created',null,new.status,
    false,'not_required',coalesce(auth.uid(),new.owner_id),
    '销售订单已创建',
    jsonb_build_object('order_number',new.order_number,'atomic',true)
  );
  return new;
end;
$$;

drop trigger if exists trg_sales_order_created_lifecycle_event on public.trade_orders;
create trigger trg_sales_order_created_lifecycle_event
after insert on public.trade_orders
for each row when (new.order_type='sales')
execute function public.capture_sales_order_created_event();
