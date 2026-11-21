-- Link shipment checklist rows to the canonical trade document records.
-- Keep shipment checklist rows for operational tracking; trade_documents remains
-- the source of truth for document content, revisions, templates and status.

alter table public.trade_documents
  add column if not exists shipment_id uuid;

alter table public.trade_shipment_documents
  add column if not exists trade_document_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'trade_documents_shipment_owner_fkey'
      and conrelid = 'public.trade_documents'::regclass
  ) then
    alter table public.trade_documents
      add constraint trade_documents_shipment_owner_fkey
      foreign key (shipment_id, owner_id)
      references public.trade_shipments(id, owner_id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'trade_shipment_documents_trade_document_owner_fkey'
      and conrelid = 'public.trade_shipment_documents'::regclass
  ) then
    alter table public.trade_shipment_documents
      add constraint trade_shipment_documents_trade_document_owner_fkey
      foreign key (owner_id, trade_document_id)
      references public.trade_documents(owner_id, id)
      on delete set null (trade_document_id);
  end if;
end
$$;

create index if not exists trade_documents_shipment_owner_idx
  on public.trade_documents(shipment_id, owner_id)
  where shipment_id is not null;

create index if not exists trade_shipment_documents_trade_document_idx
  on public.trade_shipment_documents(trade_document_id, owner_id)
  where trade_document_id is not null;

create or replace function public.validate_trade_document_shipment_link()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_shipment_order_id uuid;
begin
  if new.shipment_id is null then
    return new;
  end if;

  select s.order_id
    into v_shipment_order_id
  from public.trade_shipments s
  where s.id = new.shipment_id
    and s.owner_id = new.owner_id;

  if not found then
    raise exception 'SHIPMENT_NOT_FOUND';
  end if;

  if v_shipment_order_id is distinct from new.order_id then
    raise exception 'DOCUMENT_SHIPMENT_ORDER_MISMATCH';
  end if;

  return new;
end;
$$;

drop trigger if exists trade_documents_validate_shipment_link on public.trade_documents;
create trigger trade_documents_validate_shipment_link
before insert or update of shipment_id, order_id, owner_id
on public.trade_documents
for each row execute function public.validate_trade_document_shipment_link();

create or replace function public.validate_trade_shipment_document_link()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_document_shipment_id uuid;
begin
  if new.trade_document_id is null then
    return new;
  end if;

  select d.shipment_id
    into v_document_shipment_id
  from public.trade_documents d
  where d.id = new.trade_document_id
    and d.owner_id = new.owner_id;

  if not found then
    raise exception 'TRADE_DOCUMENT_NOT_FOUND';
  end if;

  if v_document_shipment_id is distinct from new.shipment_id then
    raise exception 'SHIPMENT_DOCUMENT_LINK_MISMATCH';
  end if;

  return new;
end;
$$;

drop trigger if exists trade_shipment_documents_validate_trade_document_link on public.trade_shipment_documents;
create trigger trade_shipment_documents_validate_trade_document_link
before insert or update of trade_document_id, shipment_id, owner_id
on public.trade_shipment_documents
for each row execute function public.validate_trade_shipment_document_link();

comment on column public.trade_documents.shipment_id is
  'Optional shipment batch for shipment-specific documents; order_id remains the commercial source order.';
comment on column public.trade_shipment_documents.trade_document_id is
  'Optional link to the canonical trade_documents record. This checklist row tracks shipment workflow only.';
