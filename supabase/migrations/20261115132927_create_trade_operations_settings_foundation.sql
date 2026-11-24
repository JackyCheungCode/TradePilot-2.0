create table if not exists public.trade_business_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  scope_key text not null check (scope_key in ('shared','shipment','payment')),
  config jsonb not null default '{}'::jsonb,
  config_version integer not null default 1 check (config_version > 0),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_business_settings_owner_scope_unique unique(owner_id, scope_key)
);
create index if not exists trade_business_settings_owner_idx on public.trade_business_settings(owner_id);
alter table public.trade_business_settings enable row level security;
create policy trade_business_settings_select_own on public.trade_business_settings for select to authenticated using ((select auth.uid()) = owner_id);
create policy trade_business_settings_insert_own on public.trade_business_settings for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy trade_business_settings_update_own on public.trade_business_settings for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
grant select, insert, update on public.trade_business_settings to authenticated;
revoke all on public.trade_business_settings from anon;

create table if not exists public.trade_business_setting_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  scope_key text not null check (scope_key in ('shared','shipment','payment')),
  setting_type text not null,
  code text not null,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  sequence integer not null default 10,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_business_setting_items_owner_scope_type_code_unique unique(owner_id,scope_key,setting_type,code),
  constraint trade_business_setting_items_code_nonempty check (length(trim(code)) > 0),
  constraint trade_business_setting_items_name_nonempty check (length(trim(name)) > 0)
);
create index if not exists trade_business_setting_items_lookup_idx on public.trade_business_setting_items(owner_id,scope_key,setting_type,is_active,sequence);
alter table public.trade_business_setting_items enable row level security;
create policy trade_business_setting_items_select_own on public.trade_business_setting_items for select to authenticated using ((select auth.uid()) = owner_id);
create policy trade_business_setting_items_insert_own on public.trade_business_setting_items for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy trade_business_setting_items_update_own on public.trade_business_setting_items for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
grant select, insert, update on public.trade_business_setting_items to authenticated;
revoke all on public.trade_business_setting_items from anon;

create table if not exists public.trade_business_setting_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  scope_key text not null check (scope_key in ('shared','shipment','payment')),
  source_table text not null,
  source_record_id uuid not null,
  operation text not null check (operation in ('INSERT','UPDATE','DEACTIVATE')),
  before_data jsonb,
  after_data jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists trade_business_setting_history_owner_idx on public.trade_business_setting_history(owner_id,scope_key,changed_at desc);
alter table public.trade_business_setting_history enable row level security;
create policy trade_business_setting_history_select_own on public.trade_business_setting_history for select to authenticated using ((select auth.uid()) = owner_id);
grant select on public.trade_business_setting_history to authenticated;
revoke all on public.trade_business_setting_history from anon;

create or replace function public.audit_trade_business_setting_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_scope text;
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_operation text;
begin
  if tg_op = 'DELETE' then
    v_owner := old.owner_id; v_scope := old.scope_key; v_id := old.id;
    v_before := to_jsonb(old); v_after := null; v_operation := 'DEACTIVATE';
  elsif tg_op = 'INSERT' then
    v_owner := new.owner_id; v_scope := new.scope_key; v_id := new.id;
    v_before := null; v_after := to_jsonb(new); v_operation := 'INSERT';
  else
    v_owner := new.owner_id; v_scope := new.scope_key; v_id := new.id;
    v_before := to_jsonb(old); v_after := to_jsonb(new); v_operation := 'UPDATE';
  end if;
  if auth.uid() is not null and auth.uid() <> v_owner then
    raise exception 'configuration owner mismatch';
  end if;
  insert into public.trade_business_setting_history(owner_id,scope_key,source_table,source_record_id,operation,before_data,after_data,changed_by)
  values(v_owner,v_scope,tg_table_name,v_id,v_operation,v_before,v_after,auth.uid());
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.audit_trade_business_setting_change() from public, anon, authenticated;
create trigger trade_business_settings_audit
after insert or update or delete on public.trade_business_settings
for each row execute function public.audit_trade_business_setting_change();
create trigger trade_business_setting_items_audit
after insert or update or delete on public.trade_business_setting_items
for each row execute function public.audit_trade_business_setting_change();

create or replace function public.set_trade_business_settings_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  if tg_table_name = 'trade_business_settings' then
    new.config_version = old.config_version + 1;
  end if;
  new.updated_by = auth.uid();
  return new;
end;
$$;
revoke all on function public.set_trade_business_settings_updated_at() from public, anon, authenticated;
create trigger trade_business_settings_updated_at
before update on public.trade_business_settings
for each row execute function public.set_trade_business_settings_updated_at();
create trigger trade_business_setting_items_updated_at
before update on public.trade_business_setting_items
for each row execute function public.set_trade_business_settings_updated_at();