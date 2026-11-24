create table if not exists public.trade_document_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  scope_key text not null check (scope_key in ('shared', 'quotation', 'sales_order')),
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_document_settings_owner_scope_unique unique (owner_id, scope_key)
);

create index if not exists trade_document_settings_owner_idx
  on public.trade_document_settings (owner_id);

alter table public.trade_document_settings enable row level security;

create policy "trade_document_settings_select_own"
  on public.trade_document_settings for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "trade_document_settings_insert_own"
  on public.trade_document_settings for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "trade_document_settings_update_own"
  on public.trade_document_settings for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

grant select, insert, update on public.trade_document_settings to authenticated;
revoke all on public.trade_document_settings from anon;

create or replace function public.set_trade_document_settings_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$begin
  new.updated_at = pg_catalog.now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trade_document_settings_updated_at on public.trade_document_settings;
create trigger trade_document_settings_updated_at
before update on public.trade_document_settings
for each row execute function public.set_trade_document_settings_updated_at();
