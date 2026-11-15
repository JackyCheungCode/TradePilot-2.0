-- Lock the commercial terms atomically when a quotation is confirmed.
-- Operational metadata/status remain mutable for payment and fulfillment workflows.

alter table public.trade_orders
  add column if not exists commercial_snapshot jsonb not null default '{}'::jsonb;

create or replace function public.prevent_locked_trade_order_commercial_changes()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.locked_at is not null then
    if new.locked_at is distinct from old.locked_at then
      raise exception 'TRADE_ORDER_LOCKED: locked_at cannot be changed';
    end if;

    if (to_jsonb(new) - array['status','confirmed_at','updated_at','metadata'])
       is distinct from
       (to_jsonb(old) - array['status','confirmed_at','updated_at','metadata']) then
      raise exception 'TRADE_ORDER_LOCKED: commercial order fields are immutable after confirmation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trade_orders_prevent_locked_commercial_changes on public.trade_orders;
create trigger trade_orders_prevent_locked_commercial_changes
before update on public.trade_orders
for each row execute function public.prevent_locked_trade_order_commercial_changes();

create or replace function public.prevent_locked_trade_order_item_changes()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_order_id uuid;
  v_owner_id uuid;
  v_locked_at timestamptz;
begin
  if tg_op = 'UPDATE' and new.order_id is distinct from old.order_id then
    raise exception 'TRADE_ORDER_ITEM_MOVE_FORBIDDEN: order line cannot be moved';
  end if;

  if tg_op = 'DELETE' then
    v_order_id := old.order_id;
    v_owner_id := old.owner_id;
  else
    v_order_id := new.order_id;
    v_owner_id := new.owner_id;
  end if;

  select locked_at
    into v_locked_at
  from public.trade_orders
  where id = v_order_id and owner_id = v_owner_id
  for update;

  if not found then
    raise exception 'TRADE_ORDER_NOT_FOUND';
  end if;

  if v_locked_at is not null then
    raise exception 'TRADE_ORDER_LOCKED: order lines are immutable after confirmation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trade_order_items_prevent_locked_changes on public.trade_order_items;
create trigger trade_order_items_prevent_locked_changes
before insert or update or delete on public.trade_order_items
for each row execute function public.prevent_locked_trade_order_item_changes();

create or replace function public.confirm_trade_quotation(
  p_owner_id uuid,
  p_document_id uuid
)
returns table(
  document_id uuid,
  order_id uuid,
  document_status text,
  order_status text
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_doc public.trade_documents%rowtype;
  v_order public.trade_orders%rowtype;
  v_items jsonb;
  v_snapshot jsonb;
  v_already_confirmed boolean := false;
begin
  if p_owner_id is null or p_document_id is null then
    raise exception 'OWNER_AND_DOCUMENT_REQUIRED';
  end if;

  select * into v_doc
  from public.trade_documents
  where id = p_document_id and owner_id = p_owner_id
  for update;

  if not found then
    raise exception 'QUOTATION_NOT_FOUND';
  end if;

  if v_doc.document_type not in ('quotation', 'request_for_quotation') then
    raise exception 'DOCUMENT_IS_NOT_A_QUOTATION';
  end if;

  select * into v_order
  from public.trade_orders
  where id = v_doc.order_id and owner_id = p_owner_id
  for update;

  if not found then
    raise exception 'RELATED_ORDER_NOT_FOUND';
  end if;

  if (v_doc.document_type = 'quotation' and v_order.order_type <> 'sales')
     or (v_doc.document_type = 'request_for_quotation' and v_order.order_type <> 'purchase') then
    raise exception 'QUOTATION_ORDER_TYPE_MISMATCH';
  end if;

  v_already_confirmed :=
    v_doc.status = 'issued'
    and v_order.status = 'active'
    and v_order.confirmed_from_document_id = v_doc.id;

  if v_already_confirmed
     and v_order.locked_at is not null
     and v_order.commercial_snapshot <> '{}'::jsonb then
    return query select v_doc.id, v_order.id, v_doc.status, v_order.status;
    return;
  end if;

  if not v_already_confirmed then
    if v_doc.status not in ('draft', 'review', 'approved') then
      raise exception 'QUOTATION_STATUS_NOT_CONFIRMABLE';
    end if;

    if v_order.status in ('cancelled', 'archived', 'completed') then
      raise exception 'ORDER_STATUS_NOT_CONFIRMABLE';
    end if;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'line_number', i.line_number,
        'sku', i.sku,
        'product_name', i.product_name,
        'description', i.description,
        'hs_code', i.hs_code,
        'origin_country_code', i.origin_country_code,
        'quantity', i.quantity,
        'unit', i.unit,
        'unit_price', i.unit_price,
        'discount_amount', i.discount_amount,
        'tax_rate', i.tax_rate,
        'amount', i.amount,
        'net_weight', i.net_weight,
        'gross_weight', i.gross_weight,
        'weight_unit', i.weight_unit,
        'product', jsonb_build_object(
          'sku', i.product_snapshot->>'sku',
          'name', i.product_snapshot->>'name',
          'english_name', i.product_snapshot->>'english_name',
          'description', i.product_snapshot->>'description',
          'specifications', i.product_snapshot->'specifications',
          'hs_code', i.product_snapshot->>'hs_code',
          'customs_description', i.product_snapshot->>'customs_description',
          'origin_country_code', i.product_snapshot->>'origin_country_code',
          'unit', i.product_snapshot->>'unit',
          'net_weight', i.product_snapshot->'net_weight',
          'gross_weight', i.product_snapshot->'gross_weight',
          'weight_unit', i.product_snapshot->>'weight_unit',
          'dimensions', i.product_snapshot->'dimensions',
          'packaging', i.product_snapshot->'packaging'
        )
      )
      order by i.line_number
    ),
    '[]'::jsonb
  )
  into v_items
  from public.trade_order_items i
  where i.order_id = v_order.id and i.owner_id = p_owner_id;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'ORDER_HAS_NO_LINES';
  end if;

  v_snapshot := jsonb_build_object(
    'schema_version', 1,
    'captured_at', now(),
    'source_document_id', v_doc.id,
    'source_document_number', v_doc.document_number,
    'order', to_jsonb(v_order) - array[
      'owner_id','metadata','internal_notes','commercial_snapshot',
      'locked_at','confirmed_at'
    ],
    'items', v_items
  );

  update public.trade_documents
  set status = 'issued',
      issued_at = coalesce(issued_at, now()),
      updated_at = now()
  where id = v_doc.id and owner_id = p_owner_id;

  update public.trade_orders
  set status = 'active',
      confirmed_at = coalesce(confirmed_at, now()),
      locked_at = coalesce(locked_at, now()),
      confirmed_from_document_id = v_doc.id,
      commercial_snapshot = v_snapshot,
      updated_at = now()
  where id = v_order.id and owner_id = p_owner_id;

  if not v_already_confirmed then
    insert into public.trade_document_events(owner_id, document_id, order_id, event_type, payload)
    values
      (p_owner_id, v_doc.id, v_order.id, 'quotation.confirmed',
        jsonb_build_object('document_number', v_doc.document_number, 'order_number', v_order.order_number)),
      (p_owner_id, v_doc.id, v_order.id, 'order.confirmed',
        jsonb_build_object('order_number', v_order.order_number, 'source_document_id', v_doc.id));
  end if;

  return query select v_doc.id, v_order.id, 'issued'::text, 'active'::text;
end;
$function$;

comment on column public.trade_orders.commercial_snapshot is
  'Immutable, sanitized commercial terms and order-line snapshot captured atomically when the source quotation is confirmed.';
