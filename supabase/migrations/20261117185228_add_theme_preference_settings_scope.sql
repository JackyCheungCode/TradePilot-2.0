-- Add a per-account theme preference namespace to the existing owner-scoped,
-- audited business settings table. Existing user settings are not modified.
alter table public.trade_business_settings
  drop constraint if exists trade_business_settings_scope_key_check;
alter table public.trade_business_settings
  add constraint trade_business_settings_scope_key_check
  check (scope_key = any (array['shared', 'shipment', 'payment', 'prospect_guardrails', 'theme_preference']::text[]));

alter table public.trade_business_setting_history
  drop constraint if exists trade_business_setting_history_scope_key_check;
alter table public.trade_business_setting_history
  add constraint trade_business_setting_history_scope_key_check
  check (scope_key = any (array['shared', 'shipment', 'payment', 'prospect_guardrails', 'theme_preference']::text[]));

comment on constraint trade_business_settings_scope_key_check on public.trade_business_settings
  is 'Supported owner-scoped settings namespaces, including theme preferences.';
comment on constraint trade_business_setting_history_scope_key_check on public.trade_business_setting_history
  is 'Supported audited settings namespaces, including theme preferences.';
