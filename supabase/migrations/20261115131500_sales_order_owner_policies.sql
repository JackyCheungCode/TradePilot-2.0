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
