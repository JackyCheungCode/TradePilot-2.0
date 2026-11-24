
create table if not exists public.crm_opportunity_setting_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  setting_type text not null check (setting_type in ('stages','types','priorities','win-loss-reasons','teams','sources','qualification','activities','follow-up','forecast','rules')),
  name text not null,
  code text,
  config jsonb not null default '{}'::jsonb,
  sequence integer not null default 10,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_opportunity_setting_items_owner_type_code_key unique (owner_id, setting_type, code)
);
create index if not exists crm_opportunity_setting_items_owner_type_idx
  on public.crm_opportunity_setting_items(owner_id, setting_type, sequence, name);
alter table public.crm_opportunity_setting_items enable row level security;
grant select, insert, update, delete on public.crm_opportunity_setting_items to authenticated;
drop policy if exists crm_opportunity_setting_items_owner_select on public.crm_opportunity_setting_items;
create policy crm_opportunity_setting_items_owner_select on public.crm_opportunity_setting_items
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists crm_opportunity_setting_items_owner_insert on public.crm_opportunity_setting_items;
create policy crm_opportunity_setting_items_owner_insert on public.crm_opportunity_setting_items
  for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists crm_opportunity_setting_items_owner_update on public.crm_opportunity_setting_items;
create policy crm_opportunity_setting_items_owner_update on public.crm_opportunity_setting_items
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists crm_opportunity_setting_items_owner_delete on public.crm_opportunity_setting_items;
create policy crm_opportunity_setting_items_owner_delete on public.crm_opportunity_setting_items
  for delete to authenticated using ((select auth.uid()) = owner_id);
