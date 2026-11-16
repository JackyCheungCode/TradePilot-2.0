-- Allow documents to be drafted independently from an existing sales or purchase order.
-- A null order_id represents a standalone document; all document content remains owner-scoped.
alter table public.trade_documents
  alter column order_id drop not null;

comment on column public.trade_documents.order_id is
  'Optional source order. NULL means the document was created independently from a blank draft.';
