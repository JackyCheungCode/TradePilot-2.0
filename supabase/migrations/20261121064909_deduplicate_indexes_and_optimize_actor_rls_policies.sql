drop index if exists public.crm_opportunity_setting_items_owner_type_idx;
drop index if exists public.discovery_records_entity_owner_idx;
drop index if exists public.leads_entity_owner_idx;
drop index if exists public.trade_products_owner_category_idx;

alter policy agent_tool_registry_owner_read on public.agent_tool_registry
  using (owner_id = (select auth.uid()));

alter policy actor_registry_owner_all on public.actor_registry
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

alter policy actor_schema_versions_owner_all on public.actor_schema_versions
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

alter policy actor_raw_records_owner_all on public.actor_raw_records
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
