alter table public.trade_orders enable row level security;
alter table public.trade_order_items enable row level security;
alter table public.trade_documents enable row level security;

drop policy if exists trade_orders_select_own on public.trade_orders;
create policy trade_orders_select_own on public.trade_orders for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists trade_orders_insert_own on public.trade_orders;
create policy trade_orders_insert_own on public.trade_orders for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists trade_orders_update_own on public.trade_orders;
create policy trade_orders_update_own on public.trade_orders for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists trade_orders_delete_own on public.trade_orders;
create policy trade_orders_delete_own on public.trade_orders for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists trade_order_items_select_own on public.trade_order_items;
create policy trade_order_items_select_own on public.trade_order_items for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists trade_order_items_insert_own on public.trade_order_items;
create policy trade_order_items_insert_own on public.trade_order_items for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists trade_order_items_update_own on public.trade_order_items;
create policy trade_order_items_update_own on public.trade_order_items for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists trade_order_items_delete_own on public.trade_order_items;
create policy trade_order_items_delete_own on public.trade_order_items for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists trade_documents_select_own on public.trade_documents;
create policy trade_documents_select_own on public.trade_documents for select to authenticated using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.trade_orders to authenticated;
grant select, insert, update, delete on public.trade_order_items to authenticated;
grant select on public.trade_documents to authenticated;
revoke all on public.trade_orders from anon;
revoke all on public.trade_order_items from anon;
revoke all on public.trade_documents from anon;

alter table public.trade_document_events enable row level security;
drop policy if exists trade_document_events_select_own on public.trade_document_events;
create policy trade_document_events_select_own on public.trade_document_events for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists trade_document_events_insert_own on public.trade_document_events;
create policy trade_document_events_insert_own on public.trade_document_events for insert to authenticated with check ((select auth.uid()) = owner_id);
grant select, insert on public.trade_document_events to authenticated;
revoke all on public.trade_document_events from anon;

alter table public.crm_account_addresses enable row level security;
drop policy if exists crm_account_addresses_select_own on public.crm_account_addresses;
create policy crm_account_addresses_select_own on public.crm_account_addresses for select to authenticated using ((select auth.uid()) = owner_id);
grant select on public.crm_account_addresses to authenticated;
revoke all on public.crm_account_addresses from anon;

alter table public.enterprise_bank_accounts enable row level security;
drop policy if exists enterprise_bank_accounts_select_own on public.enterprise_bank_accounts;
create policy enterprise_bank_accounts_select_own on public.enterprise_bank_accounts for select to authenticated using ((select auth.uid()) = owner_id);
grant select on public.enterprise_bank_accounts to authenticated;
revoke all on public.enterprise_bank_accounts from anon;

alter table public.crm_accounts enable row level security;
drop policy if exists crm_accounts_select_own on public.crm_accounts;
create policy crm_accounts_select_own on public.crm_accounts for select to authenticated using ((select auth.uid()) = owner_id);
grant select on public.crm_accounts to authenticated;
revoke all on public.crm_accounts from anon;

alter table public.crm_contacts enable row level security;
drop policy if exists crm_contacts_select_own on public.crm_contacts;
create policy crm_contacts_select_own on public.crm_contacts for select to authenticated using ((select auth.uid()) = owner_id);
grant select on public.crm_contacts to authenticated;
revoke all on public.crm_contacts from anon;
