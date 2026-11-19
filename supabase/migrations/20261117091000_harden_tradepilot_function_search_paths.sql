-- Harden existing trigger and SECURITY DEFINER functions against mutable search_path resolution.
-- Function bodies use schema-qualified table/auth references; pg_catalog remains implicitly
-- available for built-in functions when search_path is empty.
alter function public.trade_order_items_snapshot_product() set search_path = '';
alter function public.trade_products_protect_referenced_sku() set search_path = '';

alter function public.confirm_contact_active_transition(uuid, boolean, boolean, text) set search_path = '';
alter function public.confirm_customer_status_transition(uuid, text, text, text) set search_path = '';
alter function public.confirm_opportunity_stage_transition(uuid, text, text, text) set search_path = '';
alter function public.confirm_quote_status_transition(uuid, text, text) set search_path = '';
alter function public.confirm_sales_order_status_transition(uuid, text, text, text) set search_path = '';
