-- Allow documents to be drafted independently from an existing sales or purchase order.
alter table public.trade_documents
  alter column order_id drop not null;

comment on column public.trade_documents.order_id is
  'Optional source order. NULL means the document was created independently from a blank draft.';
