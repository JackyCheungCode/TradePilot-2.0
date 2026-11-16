-- Omnichannel Inbox foundation. Additive only: existing CRM and trade records remain authoritative.
-- Credentials are stored in Supabase Vault; only Vault secret names are persisted here.

create table if not exists public.inbox_channel_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel_type text not null check (channel_type in ('whatsapp','line','messenger','telegram','wecom','email')),
  display_name text not null,
  external_account_id text,
  connection_status text not null default 'not_connected'
    check (connection_status in ('not_connected','pending','connected','error','disabled')),
  credential_secret_name text,
  webhook_secret_name text,
  config jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create unique index if not exists inbox_channel_connections_external_account_uidx
  on public.inbox_channel_connections(owner_id, channel_type, external_account_id)
  where external_account_id is not null;

create table if not exists public.inbox_customer_identities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  channel_connection_id uuid,
  channel_type text not null check (channel_type in ('whatsapp','line','messenger','telegram','wecom','email')),
  external_user_id text not null,
  external_display_name text,
  external_username text,
  is_primary boolean not null default false,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, channel_type, external_user_id),
  unique (id, owner_id),
  constraint inbox_customer_identities_connection_owner_fk
    foreign key (channel_connection_id, owner_id)
    references public.inbox_channel_connections(id, owner_id) on delete set null
);

create table if not exists public.inbox_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  account_id uuid references public.crm_accounts(id) on delete set null,
  assignee_id uuid references auth.users(id) on delete set null,
  status text not null default 'open'
    check (status in ('open','pending','resolved','closed')),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz,
  last_channel_type text check (last_channel_type is null or last_channel_type in ('whatsapp','line','messenger','telegram','wecom','email')),
  last_message_preview text,
  ai_summary text,
  ai_summary_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create unique index if not exists inbox_one_active_conversation_per_contact_uidx
  on public.inbox_conversations(owner_id, contact_id)
  where status in ('open','pending');

create index if not exists inbox_conversations_owner_activity_idx
  on public.inbox_conversations(owner_id, status, last_message_at desc nulls last);

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  customer_identity_id uuid,
  channel_connection_id uuid,
  channel_type text not null check (channel_type in ('whatsapp','line','messenger','telegram','wecom','email')),
  direction text not null check (direction in ('inbound','outbound')),
  content_type text not null default 'text'
    check (content_type in ('text','image','file','audio','video','template','email_card')),
  content text not null default '',
  translated_content text,
  source_language text,
  target_language text,
  email_subject text,
  media_url text,
  attachments jsonb not null default '[]'::jsonb,
  external_message_id text,
  status text not null default 'received'
    check (status in ('queued','sending','sent','delivered','read','received','failed')),
  error_code text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inbox_messages_conversation_owner_fk
    foreign key (conversation_id, owner_id)
    references public.inbox_conversations(id, owner_id) on delete cascade,
  constraint inbox_messages_identity_owner_fk
    foreign key (customer_identity_id, owner_id)
    references public.inbox_customer_identities(id, owner_id) on delete set null,
  constraint inbox_messages_connection_owner_fk
    foreign key (channel_connection_id, owner_id)
    references public.inbox_channel_connections(id, owner_id) on delete set null
);

create unique index if not exists inbox_messages_external_id_uidx
  on public.inbox_messages(channel_connection_id, external_message_id)
  where channel_connection_id is not null and external_message_id is not null;

create index if not exists inbox_messages_conversation_timeline_idx
  on public.inbox_messages(owner_id, conversation_id, created_at, id);

create table if not exists public.inbox_internal_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  author_id uuid not null references auth.users(id) on delete restrict,
  content text not null check (length(trim(content)) between 1 and 10000),
  mentioned_user_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  constraint inbox_internal_notes_conversation_owner_fk
    foreign key (conversation_id, owner_id)
    references public.inbox_conversations(id, owner_id) on delete cascade
);

create index if not exists inbox_internal_notes_conversation_idx
  on public.inbox_internal_notes(owner_id, conversation_id, created_at);

create table if not exists public.inbox_message_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null,
  event_type text not null check (event_type in ('queued','sent','delivered','read','failed','received')),
  provider_event_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint inbox_message_events_message_owner_fk
    foreign key (message_id, owner_id)
    references public.inbox_messages(id, owner_id) on delete cascade
);

create index if not exists inbox_message_events_message_idx
  on public.inbox_message_events(owner_id, message_id, created_at);

-- Keep tenant ownership aligned with the pre-existing CRM records.
create or replace function public.inbox_assert_contact_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  contact_owner uuid;
  contact_account uuid;
  account_owner uuid;
begin
  select c.owner_id, c.account_id into contact_owner, contact_account
  from public.crm_contacts c where c.id = new.contact_id;

  if contact_owner is null or contact_owner <> new.owner_id then
    raise exception 'Inbox contact must belong to the same owner';
  end if;

  if tg_table_name = 'inbox_conversations' and new.account_id is not null then
    select a.owner_id into account_owner from public.crm_accounts a where a.id = new.account_id;
    if account_owner is null or account_owner <> new.owner_id or contact_account <> new.account_id then
      raise exception 'Inbox account must match the contact account and owner';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists inbox_customer_identities_owner_guard on public.inbox_customer_identities;
create trigger inbox_customer_identities_owner_guard
before insert or update of owner_id, contact_id on public.inbox_customer_identities
for each row execute function public.inbox_assert_contact_owner();

drop trigger if exists inbox_conversations_owner_guard on public.inbox_conversations;
create trigger inbox_conversations_owner_guard
before insert or update of owner_id, contact_id, account_id on public.inbox_conversations
for each row execute function public.inbox_assert_contact_owner();

create or replace function public.inbox_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'inbox_channel_connections',
    'inbox_customer_identities',
    'inbox_conversations',
    'inbox_messages'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.inbox_set_updated_at()',
      table_name || '_updated_at', table_name
    );
  end loop;
end;
$$;

alter table public.inbox_channel_connections enable row level security;
alter table public.inbox_customer_identities enable row level security;
alter table public.inbox_conversations enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.inbox_internal_notes enable row level security;
alter table public.inbox_message_events enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'inbox_channel_connections',
    'inbox_customer_identities',
    'inbox_conversations',
    'inbox_messages',
    'inbox_internal_notes',
    'inbox_message_events'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_select', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))', table_name || '_owner_select', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_insert', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))', table_name || '_owner_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_update', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', table_name || '_owner_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_delete', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', table_name || '_owner_delete', table_name);
    execute format('revoke all on public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end;
$$;

revoke all on function public.inbox_assert_contact_owner() from public, anon, authenticated;
grant execute on function public.inbox_assert_contact_owner() to service_role;
