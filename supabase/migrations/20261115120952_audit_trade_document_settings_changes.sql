create table if not exists public.trade_document_settings_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  scope_key text not null check (scope_key in ('shared', 'quotation', 'sales_order')),
  old_config jsonb not null default '{}'::jsonb,
  new_config jsonb not null default '{}'::jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists trade_document_settings_history_owner_scope_idx
  on public.trade_document_settings_history (owner_id, scope_key, created_at desc);

alter table public.trade_document_settings_history enable row level security;

create policy "trade_document_settings_history_select_own"
  on public.trade_document_settings_history for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "trade_document_settings_history_insert_own"
  on public.trade_document_settings_history for insert to authenticated
  with check ((select auth.uid()) = owner_id);

grant select, insert on public.trade_document_settings_history to authenticated;
revoke all on public.trade_document_settings_history from anon;

create or replace function public.audit_trade_document_settings_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.trade_document_settings_history
    (owner_id, scope_key, old_config, new_config, changed_by)
  values
    (new.owner_id, new.scope_key,
     case when tg_op = 'INSERT' then '{}'::jsonb else old.config end,
     new.config, auth.uid());
  return new;
end;
$$;

drop trigger if exists trade_document_settings_audit on public.trade_document_settings;
create trigger trade_document_settings_audit
after insert or update on public.trade_document_settings
for each row execute function public.audit_trade_document_settings_change();
