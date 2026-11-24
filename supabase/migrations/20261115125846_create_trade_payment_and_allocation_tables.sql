
create sequence if not exists public.trade_payment_no_seq;

create table if not exists public.trade_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  payment_no text not null unique default (
    'PAY-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.trade_payment_no_seq')::text, 4, '0')
  ),
  payment_type text not null default 'receipt' check (payment_type in ('receipt','refund')),
  status text not null default 'draft' check (status in ('draft','pending_confirmation','confirmed','partially_reconciled','reconciled','returned','voided')),
  payment_date date not null,
  received_date date,
  owner_name text not null,
  tags text[] not null default '{}',

  account_id uuid not null references public.crm_accounts(id) on delete restrict,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  payer_name text not null,
  is_third_party boolean not null default false,
  payer_relation text check (payer_relation in ('关联公司','代付公司','个人','其他')),
  payer_country text,
  payer_bank text,
  payer_swift text check (payer_swift is null or payer_swift ~ '^[A-Za-z0-9]{8}([A-Za-z0-9]{3})?$'),

  currency text not null,
  amount numeric(20,6) not null check (amount > 0),
  bank_fee numeric(20,6) not null default 0 check (bank_fee >= 0),
  intermediary_fee numeric(20,6) not null default 0 check (intermediary_fee >= 0),
  net_received numeric(20,6) not null check (net_received > 0 and net_received <= amount),
  fee_bearer text check (fee_bearer in ('OUR','SHA','BEN')),
  exchange_rate numeric(20,10) check (exchange_rate is null or exchange_rate > 0),
  rate_date date,
  amount_base numeric(20,6),
  order_currency text,
  fx_gain_loss numeric(20,6),

  payment_method text not null check (payment_method in ('T/T','L/C','D/P','D/A','PayPal','Western Union','现金','支票','其他')),
  bank_account_id uuid not null references public.enterprise_bank_accounts(id) on delete restrict,
  bank_reference text,
  uetr text check (uetr is null or length(uetr) = 36),
  remittance_info text,
  bank_slip text,

  lc_no text,
  lc_issuing_bank text,
  lc_advising_bank text,
  lc_amount numeric(20,6) check (lc_amount is null or lc_amount >= 0),
  lc_type text check (lc_type is null or lc_type in ('即期','远期')),
  usance_days integer check (usance_days is null or usance_days >= 0),
  presentation_date date,
  acceptance_date date,
  maturity_date date,
  discrepancy text,
  discrepancy_status text check (discrepancy_status is null or discrepancy_status in ('无','已提出','已接受','已拒付')),

  allocated_total numeric(20,6) not null default 0 check (allocated_total >= 0),
  unallocated_amount numeric(20,6) not null default 0 check (unallocated_amount >= 0),
  reconcile_status text not null default '未核销' check (reconcile_status in ('未核销','部分核销','已核销')),
  diff_amount numeric(20,6) not null default 0,
  diff_type text check (diff_type is null or diff_type in ('短收','多收','无')),
  diff_reason text check (diff_reason is null or diff_reason in ('银行手续费','汇率波动','客户扣款','议价折让','少付待补','多付待退','其他')),
  diff_handling text check (diff_handling is null or diff_handling in ('计入手续费','计入汇兑损益','保留为应收待补','转预收','退款','折让冲销','坏账核销')),
  diff_note text,

  original_payment_id uuid references public.trade_payments(id) on delete restrict,
  refund_reason text check (refund_reason is null or refund_reason in ('多付','订单取消','质量索赔','重复付款','其他')),
  refund_amount numeric(20,6) check (refund_amount is null or refund_amount > 0),
  refund_date date,
  refund_bank_ref text,

  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  bank_reconciled boolean not null default false,
  statement_date date,
  statement_ref text,
  void_reason text,

  remarks_internal text,
  attachments jsonb not null default '[]'::jsonb,
  receipt_sent boolean not null default false,
  receipt_sent_at timestamptz,
  source text not null default 'manual' check (source in ('manual','import','bank_statement_match')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_payments_third_party_relation_ck check (
    is_third_party = false or payer_relation is not null
  ),
  constraint trade_payments_lc_required_ck check (
    payment_method <> 'L/C' or (lc_no is not null and length(trim(lc_no)) > 0)
  ),
  constraint trade_payments_lc_usance_ck check (
    lc_type <> '远期' or usance_days is not null
  ),
  constraint trade_payments_refund_required_ck check (
    payment_type <> 'refund' or (original_payment_id is not null and refund_amount is not null)
  )
);

create table if not exists public.trade_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  payment_id uuid not null references public.trade_payments(id) on delete cascade,
  order_id uuid not null references public.trade_orders(id) on delete restrict,
  schedule_node_id text,
  allocation_type text not null default '其他' check (allocation_type in ('定金','尾款','全款','预收','其他')),
  allocated_amount numeric(20,6) not null check (allocated_amount > 0),
  allocated_amount_in_payment numeric(20,6) not null check (allocated_amount_in_payment > 0),
  allocation_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trade_payments_owner_received_idx on public.trade_payments(owner_id, received_date desc);
create index if not exists trade_payments_account_idx on public.trade_payments(owner_id, account_id, received_date desc);
create index if not exists trade_payments_status_idx on public.trade_payments(owner_id, status, received_date);
create index if not exists trade_payment_allocations_payment_idx on public.trade_payment_allocations(owner_id, payment_id);
create index if not exists trade_payment_allocations_order_idx on public.trade_payment_allocations(owner_id, order_id, schedule_node_id);

create unique index if not exists trade_payments_bank_reference_unique
on public.trade_payments(owner_id, bank_account_id, bank_reference, amount)
where bank_reference is not null and status <> 'voided';

alter table public.trade_payments enable row level security;
alter table public.trade_payment_allocations enable row level security;

drop policy if exists trade_payments_select_own on public.trade_payments;
create policy trade_payments_select_own on public.trade_payments for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists trade_payments_insert_own on public.trade_payments;
create policy trade_payments_insert_own on public.trade_payments for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists trade_payments_update_own on public.trade_payments;
create policy trade_payments_update_own on public.trade_payments for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists trade_payments_delete_own on public.trade_payments;
create policy trade_payments_delete_own on public.trade_payments for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists trade_payment_allocations_select_own on public.trade_payment_allocations;
create policy trade_payment_allocations_select_own on public.trade_payment_allocations for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists trade_payment_allocations_insert_own on public.trade_payment_allocations;
create policy trade_payment_allocations_insert_own on public.trade_payment_allocations for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists trade_payment_allocations_update_own on public.trade_payment_allocations;
create policy trade_payment_allocations_update_own on public.trade_payment_allocations for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists trade_payment_allocations_delete_own on public.trade_payment_allocations;
create policy trade_payment_allocations_delete_own on public.trade_payment_allocations for delete to authenticated using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.trade_payments to authenticated;
grant select, insert, update, delete on public.trade_payment_allocations to authenticated;
grant usage, select on sequence public.trade_payment_no_seq to authenticated;
