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
    'items', v_items,
    'enterprise_profile', (
      select jsonb_build_object(
        'id', ep.id, 'legal_name', ep.legal_name, 'trade_name', ep.trade_name, 'short_name', ep.short_name,
        'registration_number', ep.registration_number, 'registration_authority', ep.registration_authority,
        'established_on', ep.established_on, 'country_code', ep.country_code, 'registration_country', ep.registration_country,
        'tax_number', ep.tax_number, 'vat_number', ep.vat_number, 'eori_number', ep.eori_number,
        'duns_number', ep.duns_number, 'lei_number', ep.lei_number, 'export_license_number', ep.export_license_number,
        'customs_registration_number', ep.customs_registration_number, 'legal_form', ep.legal_form,
        'registered_address', ep.registered_address, 'headquarters_address', ep.headquarters_address,
        'mailing_address', ep.mailing_address, 'email', ep.email, 'phone', ep.phone, 'fax', ep.fax,
        'contact_name', ep.contact_name, 'contact_title', ep.contact_title, 'website', ep.website,
        'logo_url', ep.logo_url, 'default_currency', ep.default_currency,
        'default_payment_terms', ep.default_payment_terms, 'default_incoterms', ep.default_incoterms
      )
      from public.enterprise_profiles ep
      where ep.id = v_order.enterprise_profile_id and ep.owner_id = p_owner_id
    ),
    'crm_account', (
      select jsonb_build_object(
        'id', ca.id, 'account_name', ca.account_name, 'legal_name', ca.legal_name,
        'country_code', ca.country_code, 'region', ca.region, 'city', ca.city,
        'registration_number', ca.registration_number, 'tax_number', ca.tax_number, 'vat_number', ca.vat_number,
        'billing_address', ca.billing_address, 'shipping_address', ca.shipping_address,
        'currency_code', ca.currency_code, 'payment_terms', ca.payment_terms,
        'incoterms_code', ca.incoterms_code, 'incoterms_version', ca.incoterms_version,
        'email', ca.email, 'phone', ca.phone, 'fax', ca.fax, 'website', ca.website,
        'invoice_email', ca.invoice_email, 'remittance_email', ca.remittance_email,
        'legal_form', ca.legal_form, 'language_code', ca.language_code,
        'street', ca.street, 'postal_code', ca.postal_code
      )
      from public.crm_accounts ca
      where ca.id = v_order.crm_account_id and ca.owner_id = p_owner_id
    ),
    'crm_contact', (
      select jsonb_build_object(
        'id', cc.id, 'first_name', cc.first_name, 'last_name', cc.last_name, 'full_name', cc.full_name,
        'job_title', cc.job_title, 'department', cc.department, 'email', cc.email,
        'phone', cc.phone, 'mobile', cc.mobile, 'whatsapp', cc.whatsapp,
        'preferred_language', cc.preferred_language, 'salutation', cc.salutation,
        'title', cc.title, 'phone_extension', cc.phone_extension, 'preferred_channel', cc.preferred_channel
      )
      from public.crm_contacts cc
      where cc.id = v_order.crm_contact_id and cc.owner_id = p_owner_id
    ),
    'bank_accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ba.id, 'bank_name', ba.bank_name, 'bank_branch', ba.bank_branch,
        'account_name', ba.account_name, 'account_number', ba.account_number, 'iban', ba.iban,
        'swift_bic', ba.swift_bic, 'routing_number', ba.routing_number, 'sort_code', ba.sort_code,
        'bank_code', ba.bank_code, 'branch_code', ba.branch_code, 'currency_code', ba.currency_code,
        'country_code', ba.country_code, 'bank_address', ba.bank_address,
        'intermediary_bank', ba.intermediary_bank, 'is_default', ba.is_default
      ) order by ba.is_default desc, ba.created_at)
      from public.enterprise_bank_accounts ba
      where ba.enterprise_id = v_order.enterprise_profile_id
        and ba.owner_id = p_owner_id and ba.is_active = true and ba.is_archived = false
    ), '[]'::jsonb)
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
