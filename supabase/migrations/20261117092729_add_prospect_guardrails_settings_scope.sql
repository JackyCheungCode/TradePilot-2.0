-- Add an owner-scoped, audited configuration namespace for Prospect Discovery guardrails.
-- The existing tables already enforce owner_id isolation through RLS and write an audit
-- history row on INSERT/UPDATE/DELETE. No existing settings or history rows are rewritten.
alter table public.trade_business_settings
  drop constraint if exists trade_business_settings_scope_key_check;
alter table public.trade_business_settings
  add constraint trade_business_settings_scope_key_check
  check (scope_key = any (array['shared', 'shipment', 'payment', 'prospect_guardrails']::text[]));

alter table public.trade_business_setting_history
  drop constraint if exists trade_business_setting_history_scope_key_check;
alter table public.trade_business_setting_history
  add constraint trade_business_setting_history_scope_key_check
  check (scope_key = any (array['shared', 'shipment', 'payment', 'prospect_guardrails']::text[]));

comment on constraint trade_business_settings_scope_key_check on public.trade_business_settings
  is 'Supported owner-scoped settings namespaces, including Prospect Discovery guardrails.';
comment on constraint trade_business_setting_history_scope_key_check on public.trade_business_setting_history
  is 'Supported audited settings namespaces, including Prospect Discovery guardrails.';
