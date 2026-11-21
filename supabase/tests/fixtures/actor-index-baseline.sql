-- Minimal Supabase objects needed to test the actor RLS and duplicate-index hardening migration.
create table if not exists public.trade_products (owner_id uuid, category_id uuid);
create table if not exists public.crm_opportunity_setting_items (
  owner_id uuid, setting_type text, sequence integer, name text
);
create table if not exists public.agent_tool_registry (owner_id uuid);
create table if not exists public.actor_registry (owner_id uuid);
create table if not exists public.actor_schema_versions (owner_id uuid);
create table if not exists public.actor_raw_records (owner_id uuid);

create index if not exists crm_opportunity_setting_items_owner_type_idx
  on public.crm_opportunity_setting_items(owner_id,setting_type,sequence,name);
create index if not exists crm_opportunity_setting_items_owner_type_sequence_idx
  on public.crm_opportunity_setting_items(owner_id,setting_type,sequence,name);
create index if not exists discovery_records_entity_owner_fkey_idx
  on public.discovery_records(entity_id,owner_id) where entity_id is not null;
create index if not exists discovery_records_entity_owner_idx
  on public.discovery_records(entity_id,owner_id) where entity_id is not null;
create index if not exists leads_entity_owner_fkey_idx
  on public.leads(entity_id,owner_id) where entity_id is not null;
create index if not exists leads_entity_owner_idx
  on public.leads(entity_id,owner_id) where entity_id is not null;
create index if not exists idx_trade_products_owner_category
  on public.trade_products(owner_id,category_id);
create index if not exists trade_products_owner_category_idx
  on public.trade_products(owner_id,category_id);

alter table public.agent_tool_registry enable row level security;
alter table public.actor_registry enable row level security;
alter table public.actor_schema_versions enable row level security;
alter table public.actor_raw_records enable row level security;

do $$
begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='agent_tool_registry' and policyname='agent_tool_registry_owner_read') then
    create policy agent_tool_registry_owner_read on public.agent_tool_registry
      for select to authenticated using (owner_id = auth.uid());
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='actor_registry' and policyname='actor_registry_owner_all') then
    create policy actor_registry_owner_all on public.actor_registry
      for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='actor_schema_versions' and policyname='actor_schema_versions_owner_all') then
    create policy actor_schema_versions_owner_all on public.actor_schema_versions
      for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='actor_raw_records' and policyname='actor_raw_records_owner_all') then
    create policy actor_raw_records_owner_all on public.actor_raw_records
      for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;
end $$;
