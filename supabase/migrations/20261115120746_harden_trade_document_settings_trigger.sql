create or replace function public.set_trade_document_settings_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  new.updated_by = auth.uid();
  return new;
end;
$$;
