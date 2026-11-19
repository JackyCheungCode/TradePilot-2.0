create sequence if not exists public.trade_shipment_no_seq;
create table if not exists public.trade_shipments (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 shipment_no text not null default ('SH-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.trade_shipment_no_seq')::text,4,'0')),
 status text not null default 'draft' check(status in ('draft','pending_booking','booked','loaded','customs_cleared','departed','in_transit','arrived','import_cleared','delivered','cancelled')),
 order_id uuid not null references public.trade_orders(id) on delete restrict, shipment_seq integer not null default 1 check(shipment_seq>0),
 planned_ship_date date not null, actual_ship_date date, owner_name text not null, priority text,
 account_id uuid references public.crm_accounts(id) on delete set null, contact_id uuid references public.crm_contacts(id) on delete set null,
 customer_po_no text, ship_to_address jsonb not null default '{}'::jsonb, trade_terms_snapshot jsonb not null default '{}'::jsonb,
 deviation_reason text, header jsonb not null default '{}'::jsonb,
 total_packages numeric(14,3) not null default 0 check(total_packages>=0), total_net_weight numeric(14,3) not null default 0 check(total_net_weight>=0),
 total_gross_weight numeric(14,3) not null default 0 check(total_gross_weight>=0), total_volume numeric(14,4) not null default 0 check(total_volume>=0),
 container_qty integer not null default 0 check(container_qty>=0), total_fee_ours numeric(18,2) not null default 0,
 total_fee_customer numeric(18,2) not null default 0, shipment_value numeric(18,2) not null default 0, currency_code text not null default 'USD',
 exception_flag boolean not null default false, exception_type text, exception_note text, remarks_external text, notes_internal text, cancel_reason text,
 created_by uuid references auth.users(id), updated_by uuid references auth.users(id), language text not null default 'zh-CN',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id,shipment_no), unique(id,owner_id)
);
create table if not exists public.trade_shipment_items (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 shipment_id uuid not null, order_id uuid not null references public.trade_orders(id) on delete restrict,
 order_line_id uuid not null references public.trade_order_items(id) on delete restrict, line_no integer not null,
 product_id uuid, sku text, description text, ordered_qty numeric(18,4) not null default 0, shipped_before numeric(18,4) not null default 0,
 ship_qty numeric(18,4) not null check(ship_qty>0), remaining_after numeric(18,4) not null default 0,
 uom text, packages numeric(14,3) not null default 0, carton_from text, carton_to text, package_type text,
 net_weight numeric(14,3) not null default 0, gross_weight numeric(14,3) not null default 0, volume numeric(14,4) not null default 0,
 container_no text, hs_code text, origin_country text, unit_price numeric(18,4) not null default 0,
 line_value numeric(18,2) not null default 0, batch_no text, line_remark text, line_snapshot jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint trade_shipment_items_shipment_owner_fkey foreign key(shipment_id,owner_id) references public.trade_shipments(id,owner_id) on delete cascade
);
create table if not exists public.trade_shipment_containers (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 shipment_id uuid not null, container_no text not null, container_type text, seal_no text, packages numeric(14,3) not null default 0,
 gross_weight numeric(14,3) not null default 0, volume numeric(14,4) not null default 0, load_date date, load_location text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint trade_shipment_containers_shipment_owner_fkey foreign key(shipment_id,owner_id) references public.trade_shipments(id,owner_id) on delete cascade,
 constraint trade_shipment_container_no_format check(container_no ~ '^[A-Z]{4}[0-9]{7}$'), unique(shipment_id,container_no)
);
create table if not exists public.trade_shipment_fees (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 shipment_id uuid not null, fee_type text not null, payee text, amount numeric(18,2) not null default 0 check(amount>=0),
 currency_code text not null default 'USD', paid_by text not null default 'ours' check(paid_by in ('ours','customer')),
 payable_status text not null default 'unpaid' check(payable_status in ('unpaid','paid')), invoice_ref text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint trade_shipment_fees_shipment_owner_fkey foreign key(shipment_id,owner_id) references public.trade_shipments(id,owner_id) on delete cascade
);
create table if not exists public.trade_shipment_milestones (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 shipment_id uuid not null, milestone text not null, planned_at timestamptz, actual_at timestamptz, location text,
 source text not null default 'manual' check(source in ('manual','forwarder','carrier')), note text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint trade_shipment_milestones_shipment_owner_fkey foreign key(shipment_id,owner_id) references public.trade_shipments(id,owner_id) on delete cascade
);
create table if not exists public.trade_shipment_documents (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 shipment_id uuid not null, doc_type text not null, doc_ref text,
 status text not null default 'not_started' check(status in ('not_started','generated','sent','confirmed')),
 sent_at timestamptz, file_path text, file_name text, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint trade_shipment_documents_shipment_owner_fkey foreign key(shipment_id,owner_id) references public.trade_shipments(id,owner_id) on delete cascade
);
create index if not exists trade_shipments_owner_status_idx on public.trade_shipments(owner_id,status,created_at desc);
create index if not exists trade_shipments_order_idx on public.trade_shipments(order_id,owner_id);
create index if not exists trade_shipment_items_order_line_idx on public.trade_shipment_items(order_line_id,owner_id);
create index if not exists trade_shipment_items_shipment_idx on public.trade_shipment_items(shipment_id,owner_id);
create index if not exists trade_shipment_containers_shipment_idx on public.trade_shipment_containers(shipment_id,owner_id);
create index if not exists trade_shipment_fees_shipment_idx on public.trade_shipment_fees(shipment_id,owner_id);
create index if not exists trade_shipment_milestones_shipment_idx on public.trade_shipment_milestones(shipment_id,owner_id);
create index if not exists trade_shipment_documents_shipment_idx on public.trade_shipment_documents(shipment_id,owner_id);
do $$
declare t text;
begin
 foreach t in array array['trade_shipments','trade_shipment_items','trade_shipment_containers','trade_shipment_fees','trade_shipment_milestones','trade_shipment_documents'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists %I on public.%I',t||'_select_own',t);
  execute format('drop policy if exists %I on public.%I',t||'_insert_own',t);
  execute format('drop policy if exists %I on public.%I',t||'_update_own',t);
  execute format('drop policy if exists %I on public.%I',t||'_delete_own',t);
  execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid())=owner_id)',t||'_select_own',t);
  execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid())=owner_id)',t||'_insert_own',t);
  execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id)',t||'_update_own',t);
  execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid())=owner_id)',t||'_delete_own',t);
 end loop;
end $$;
grant select,insert,update,delete on public.trade_shipments,public.trade_shipment_items,public.trade_shipment_containers,public.trade_shipment_fees,public.trade_shipment_milestones,public.trade_shipment_documents to authenticated;
grant usage,select on sequence public.trade_shipment_no_seq to authenticated;
