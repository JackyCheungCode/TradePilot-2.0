-- Dynamic Tool Registry v1
-- System tools are centrally seeded; user registrations are scoped to an owner.
create table if not exists public.agent_tool_registry (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null references auth.users(id) on delete cascade,
  tool_key text not null,
  name text not null,
  description text not null default '',
  category text not null default 'general',
  source text not null check (source in ('system','external')),
  implementation_key text null,
  connection_id uuid null references public.agent_connections(id) on delete cascade,
  protocol_tool_name text null,
  risk text not null default 'approval_required' check (risk in ('read_only','approval_required','blocked')),
  policy_source text not null default 'default' check (policy_source in ('system','default','user')),
  enabled boolean not null default true,
  status text not null default 'active' check (status in ('active','disabled','pending','error')),
  input_schema jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_tool_registry_scope_check check (
    (source = 'system' and owner_id is null and implementation_key is not null and connection_id is null)
    or
    (source = 'external' and owner_id is not null and connection_id is not null and protocol_tool_name is not null)
  )
);
create unique index if not exists agent_tool_registry_system_key_uq
  on public.agent_tool_registry(tool_key) where source='system';
create unique index if not exists agent_tool_registry_owner_key_uq
  on public.agent_tool_registry(owner_id,tool_key) where source='external';
create index if not exists agent_tool_registry_owner_updated_idx
  on public.agent_tool_registry(owner_id,updated_at desc) where owner_id is not null;
alter table public.agent_tool_registry enable row level security;
drop policy if exists "agent_tool_registry_owner_read" on public.agent_tool_registry;
create policy "agent_tool_registry_owner_read" on public.agent_tool_registry
  for select to authenticated using (owner_id = auth.uid());
revoke all on public.agent_tool_registry from anon, authenticated;
grant select on public.agent_tool_registry to authenticated;
grant all on public.agent_tool_registry to service_role;
insert into public.agent_tool_registry
  (tool_key,name,description,category,source,implementation_key,risk,policy_source,enabled,status)
values
 ('search_leads','潜在客户查询','查询当前账户拥有权的潜在客户记录','business_data','system','search_leads','read_only','system',true,'active'),
 ('search_discovery_records','全网发现记录查询','查询当前账户拥有权的全网发现记录','business_data','system','search_discovery_records','read_only','system',true,'active'),
 ('search_crm_accounts','CRM 客户企业查询','查询当前账户拥有权的 CRM 客户企业','business_data','system','search_crm_accounts','read_only','system',true,'active'),
 ('search_crm_contacts','CRM 联系人查询','查询当前账户拥有权的 CRM 联系人','business_data','system','search_crm_contacts','read_only','system',true,'active'),
 ('search_crm_opportunities','CRM 商机查询','查询当前账户拥有权的 CRM 商机','business_data','system','search_crm_opportunities','read_only','system',true,'active'),
 ('search_trade_orders','贸易订单查询','查询当前账户拥有权的贸易订单','business_data','system','search_trade_orders','read_only','system',true,'active'),
 ('search_trade_shipments','发运记录查询','查询当前账户拥有权的发运记录','business_data','system','search_trade_shipments','read_only','system',true,'active'),
 ('search_trade_payments','收付款记录查询','查询当前账户拥有权的收付款记录','business_data','system','search_trade_payments','read_only','system',true,'active'),
 ('search_agent_runs','Agent 执行任务查询','查询当前账户拥有权的 Agent 执行任务','agent_operations','system','search_agent_runs','read_only','system',true,'active'),
 ('search_discovery_runs','潜客发现任务查询','查询当前账户拥有权的潜客发现任务','agent_operations','system','search_discovery_runs','read_only','system',true,'active')
on conflict do nothing;
