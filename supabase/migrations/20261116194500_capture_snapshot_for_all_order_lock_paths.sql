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
      where ep.id = new.enterprise_profile_id and ep.owner_id = new.owner_id
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
      where ca.id = new.crm_account_id and ca.owner_id = new.owner_id
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
      where cc.id = new.crm_contact_id and cc.owner_id = new.owner_id
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
      where ba.enterprise_id = new.enterprise_profile_id
        and ba.owner_id = new.owner_id and ba.is_active = true and ba.is_archived = false
    ), '[]'::jsonb),
      'sales_order', jsonb_build_object(
      'account_snapshot', new.metadata #> '{sales_order,account_snapshot}',
      'contact_snapshot', new.metadata #> '{sales_order,contact_snapshot}',
      'bank_account_snapshot', new.metadata #> '{sales_order,bank_account_snapshot}',
      'selected_addresses', new.metadata #> '{sales_order,selected_addresses}',
      'charges', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', charge->'name', 'amount', charge->'amount',
          'taxable', charge->'taxable', 'taxRate', charge->'taxRate'
        ))
        from jsonb_array_elements(case
          when jsonb_typeof(new.metadata #> '{sales_order,charges}') = 'array'
          then new.metadata #> '{sales_order,charges}'
          else '[]'::jsonb end) charge
      ), '[]'::jsonb),
      'payment_schedule', coalesce((
        select jsonb_agg(jsonb_build_object(
          'milestone', payment->'milestone', 'ratio', payment->'ratio',
          'due_date', payment->'due_date', 'trigger', payment->'trigger',
          'amount', payment->'amount', 'status', payment->'status'
        ))
        from jsonb_array_elements(case
          when jsonb_typeof(new.metadata #> '{sales_order,payment_schedule}') = 'array'
          then new.metadata #> '{sales_order,payment_schedule}'
          else '[]'::jsonb end) payment
      ), '[]'::jsonb),
      'totals', jsonb_build_object(
        'product_subtotal', coalesce(new.metadata #> '{sales_order,totals,product_subtotal}', '0'::jsonb),
        'line_discount_total', coalesce(new.metadata #> '{sales_order,totals,line_discount_total}', '0'::jsonb),
        'order_discount', coalesce(new.metadata #> '{sales_order,totals,order_discount}', '0'::jsonb),
        'charge_subtotal', coalesce(new.metadata #> '{sales_order,totals,charge_subtotal}', '0'::jsonb),
        'tax_total', coalesce(new.metadata #> '{sales_order,totals,tax_total}', '0'::jsonb),
        'grand_total', coalesce(new.metadata #> '{sales_order,totals,grand_total}', '0'::jsonb)
      ),
      'tax_mode', new.metadata #> '{sales_order,form,tax_mode}',
      'order_discount', new.metadata #> '{sales_order,form,order_discount}'
    )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trade_orders_00_capture_snapshot_before_lock on public.trade_orders;
create trigger trade_orders_00_capture_snapshot_before_lock
before update of locked_at on public.trade_orders
for each row execute function public.capture_trade_order_snapshot_before_lock();
