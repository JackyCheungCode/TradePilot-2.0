create table if not exists public.record_activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null check (record_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  record_id uuid not null,
  activity_type text not null default 'note' check (activity_type in ('note','message','comment')),
  visibility text not null default 'internal' check (visibility in ('internal','external')),
  body text not null check (length(trim(body)) between 1 and 20000),
  parent_activity_id uuid references public.record_activities(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint record_activities_parent_owner_fk foreign key (parent_activity_id, owner_id)
    references public.record_activities(id, owner_id) on delete restrict
);

create table if not exists public.record_activity_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null check (record_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  record_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 240),
  description text,
  activity_type text not null default 'todo' check (activity_type in ('todo','call','email','meeting','follow_up','reminder','other')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','done','cancelled')),
  due_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.record_followers (
  owner_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null check (record_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  record_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, record_type, record_id, user_id)
);

create table if not exists public.record_activity_attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.record_activities(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  content_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (owner_id, storage_bucket, storage_path),
  constraint record_activity_attachments_owner_fk foreign key (activity_id, owner_id)
    references public.record_activities(id, owner_id) on delete cascade
);

create table if not exists public.record_audit_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null,
  record_id uuid not null,
  event_type text not null check (event_type in ('created','updated','deleted')),
  actor_id uuid references auth.users(id) on delete set null,
  source text not null default 'database',
  field_changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists record_activities_record_idx on public.record_activities(owner_id, record_type, record_id, created_at desc);
create index if not exists record_activities_owner_idx on public.record_activities(owner_id, created_at desc);
create index if not exists record_activity_tasks_record_idx on public.record_activity_tasks(owner_id, record_type, record_id, status, due_at);
create index if not exists record_activity_tasks_assignee_idx on public.record_activity_tasks(owner_id, assigned_to, status, due_at);
create index if not exists record_activity_attachments_activity_idx on public.record_activity_attachments(owner_id, activity_id, created_at desc);
create index if not exists record_followers_user_idx on public.record_followers(owner_id, user_id, created_at desc);
create index if not exists record_audit_events_record_idx on public.record_audit_events(owner_id, record_type, record_id, created_at desc);
create index if not exists record_audit_events_owner_idx on public.record_audit_events(owner_id, created_at desc);

alter table public.record_activities enable row level security;
alter table public.record_activity_tasks enable row level security;
alter table public.record_followers enable row level security;
alter table public.record_activity_attachments enable row level security;
alter table public.record_audit_events enable row level security;

create policy record_activities_select_own on public.record_activities for select to authenticated using ((select auth.uid()) = owner_id);
create policy record_activities_insert_own on public.record_activities for insert to authenticated with check ((select auth.uid()) = owner_id and (created_by is null or created_by = (select auth.uid())));
create policy record_activities_update_own on public.record_activities for update to authenticated using ((select auth.uid()) = owner_id and created_by = (select auth.uid())) with check ((select auth.uid()) = owner_id and created_by = (select auth.uid()));
create policy record_activity_tasks_select_own on public.record_activity_tasks for select to authenticated using ((select auth.uid()) = owner_id);
create policy record_activity_tasks_insert_own on public.record_activity_tasks for insert to authenticated with check ((select auth.uid()) = owner_id and (created_by is null or created_by = (select auth.uid())));
create policy record_activity_tasks_update_own on public.record_activity_tasks for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy record_followers_select_own on public.record_followers for select to authenticated using ((select auth.uid()) = owner_id);
create policy record_followers_insert_own on public.record_followers for insert to authenticated with check ((select auth.uid()) = owner_id and user_id = (select auth.uid()));
create policy record_followers_delete_own on public.record_followers for delete to authenticated using ((select auth.uid()) = owner_id and user_id = (select auth.uid()));
create policy record_activity_attachments_select_own on public.record_activity_attachments for select to authenticated using ((select auth.uid()) = owner_id);
create policy record_activity_attachments_insert_own on public.record_activity_attachments for insert to authenticated with check ((select auth.uid()) = owner_id and (uploaded_by is null or uploaded_by = (select auth.uid())));
create policy record_audit_events_select_own on public.record_audit_events for select to authenticated using ((select auth.uid()) = owner_id);

revoke all on public.record_activities, public.record_activity_tasks, public.record_followers, public.record_activity_attachments, public.record_audit_events from anon;
revoke update, delete on public.record_audit_events from authenticated;
grant select, insert, update on public.record_activities, public.record_activity_tasks to authenticated;
grant select, insert, delete on public.record_followers to authenticated;
grant select, insert on public.record_activity_attachments to authenticated;
grant select on public.record_audit_events to authenticated;

create schema if not exists private;

create or replace function private.capture_record_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_owner_id uuid;
  v_record_id uuid;
  v_changes jsonb := '{}'::jsonb;
  v_event text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_event := 'created';
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_event := 'updated';
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value)), '{}'::jsonb)
      into v_changes
      from jsonb_each(v_old) as o
      join jsonb_each(v_new) as n using (key)
      where o.value is distinct from n.value
        and n.key !~* '(password|secret|token|api.?key|private.?key|credential|authorization|session|cookie|encryption|signing)'
        and n.key not in ('updated_at','last_seen_at');
    if v_changes = '{}'::jsonb then
      return new;
    end if;
  else
    v_old := to_jsonb(old);
    v_event := 'deleted';
  end if;

  v_owner_id := coalesce(v_new->>'owner_id', v_old->>'owner_id')::uuid;
  v_record_id := coalesce(v_new->>'id', v_old->>'id')::uuid;
  if v_owner_id is null or v_record_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  insert into public.record_audit_events(owner_id, record_type, record_id, event_type, actor_id, source, field_changes)
  values (v_owner_id, tg_table_name, v_record_id, v_event, auth.uid(), 'database_trigger', v_changes);

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'crm_accounts','crm_contacts','crm_opportunities',
    'trade_products','trade_product_categories','trade_documents','trade_orders',
    'trade_order_items','trade_shipments','trade_shipment_items','trade_payments',
    'trade_payment_allocations'
  ];
begin
  foreach v_table in array v_tables loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_table and column_name = 'owner_id'
    ) and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_table and column_name = 'id'
    ) then
      execute format('drop trigger if exists %I on public.%I', v_table || '_record_audit', v_table);
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function private.capture_record_audit_event()',
        v_table || '_record_audit', v_table
      );
    end if;
  end loop;
end;
$$;

revoke all on function private.capture_record_audit_event() from public, anon, authenticated;
