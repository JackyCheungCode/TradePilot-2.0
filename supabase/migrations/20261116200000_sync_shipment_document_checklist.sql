-- Keep the operational shipment checklist synchronized with canonical documents.
-- The insert/update runs in the same transaction as the trade_documents write.

create or replace function public.sync_trade_document_to_shipment_checklist()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  if new.shipment_id is null then
    return new;
  end if;

  v_status := case
    when new.status = 'issued' then 'confirmed'
    when new.status in ('draft','review','approved') then 'generated'
    else null
  end;

  if tg_op = 'INSERT' then
    insert into public.trade_shipment_documents(
      owner_id, shipment_id, trade_document_id, doc_type, doc_ref, status, metadata
    )
    values (
      new.owner_id, new.shipment_id, new.id, new.document_type, new.document_number,
      coalesce(v_status, 'not_started'),
      jsonb_build_object('source', 'trade_documents', 'document_status', new.status)
    );
  else
    update public.trade_shipment_documents
    set doc_type = new.document_type,
        doc_ref = new.document_number,
        status = coalesce(v_status, status),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('document_status', new.status),
        updated_at = now()
    where owner_id = new.owner_id
      and trade_document_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trade_documents_sync_shipment_checklist on public.trade_documents;
create trigger trade_documents_sync_shipment_checklist
after insert or update of status, document_number, document_type
on public.trade_documents
for each row execute function public.sync_trade_document_to_shipment_checklist();
