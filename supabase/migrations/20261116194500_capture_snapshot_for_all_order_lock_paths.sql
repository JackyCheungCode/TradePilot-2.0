-- Guarantee that every path which first locks an order captures a snapshot.
-- This covers the sales-order UI as well as quotation confirmation RPC calls.

create or replace function public.capture_trade_order_snapshot_before_lock()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_items jsonb;
  v_source_document_number text;
begin
  if old.locked_at is null
     and new.locked_at is not null
     and coalesce(new.commercial_snapshot, '{}'::jsonb) = '{}'::jsonb then

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
    where i.order_id = new.id
      and i.owner_id = new.owner_id;

    if jsonb_array_length(v_items) = 0 then
      raise exception 'ORDER_HAS_NO_LINES';
    end if;

    if new.confirmed_from_document_id is not null then
      select d.document_number
        into v_source_document_number
      from public.trade_documents d
      where d.id = new.confirmed_from_document_id
        and d.owner_id = new.owner_id;
    end if;

    new.commercial_snapshot := jsonb_build_object(
      'schema_version', 1,
      'snapshot_reason', 'order_confirmation',
      'captured_at', now(),
      'source_document_id', new.confirmed_from_document_id,
      'source_document_number', v_source_document_number,
      'order', to_jsonb(new) - array[
        'owner_id','metadata','internal_notes','commercial_snapshot','locked_at'
      ],
      'items', v_items
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trade_orders_00_capture_snapshot_before_lock on public.trade_orders;
create trigger trade_orders_00_capture_snapshot_before_lock
before update of locked_at on public.trade_orders
for each row execute function public.capture_trade_order_snapshot_before_lock();
