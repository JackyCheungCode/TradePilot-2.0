-- Persist provider webhook idempotency keys and only retain normalized payloads when manual customer matching is required.
create table if not exists public.inbox_webhook_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel_connection_id uuid not null,
  channel_type text not null check (channel_type in ('whatsapp','line','messenger','telegram')),
  external_event_id text not null check (length(external_event_id) between 1 and 512),
  event_type text not null default 'message',
  status text not null default 'processing'
    check (status in ('processing','unmatched','processed','ignored','failed')),
  payload jsonb not null default '{}'::jsonb,
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint inbox_webhook_events_connection_owner_fk
    foreign key (channel_connection_id, owner_id)
    references public.inbox_channel_connections(id, owner_id) on delete cascade,
  unique (channel_connection_id, external_event_id)
);

create index if not exists inbox_webhook_events_owner_unmatched_idx
  on public.inbox_webhook_events(owner_id, received_at desc)
  where status = 'unmatched';

alter table public.inbox_webhook_events enable row level security;
drop policy if exists inbox_webhook_events_owner_select on public.inbox_webhook_events;
create policy inbox_webhook_events_owner_select on public.inbox_webhook_events
  for select to authenticated using (owner_id = (select auth.uid()));

revoke all on public.inbox_webhook_events from anon;
revoke insert, update, delete on public.inbox_webhook_events from authenticated;
grant select on public.inbox_webhook_events to authenticated;
grant all on public.inbox_webhook_events to service_role;

-- Process one normalized provider event atomically: create/find the conversation, deduplicate the message,
-- increment unread exactly once, and acknowledge the webhook event in the same transaction.
create or replace function public.inbox_process_webhook_event(
  p_event_id uuid,
  p_owner_id uuid,
  p_contact_id uuid,
  p_identity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.inbox_webhook_events%rowtype;
  v_identity public.inbox_customer_identities%rowtype;
  v_account_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_payload jsonb;
  v_content text;
  v_created_at timestamptz;
begin
  select * into v_event
  from public.inbox_webhook_events
  where id = p_event_id and owner_id = p_owner_id
    and status in ('processing','unmatched')
  for update;

  if not found then
    raise exception 'INBOX_WEBHOOK_EVENT_NOT_PROCESSABLE';
  end if;

  select * into v_identity
  from public.inbox_customer_identities
  where id = p_identity_id and owner_id = p_owner_id
    and contact_id = p_contact_id and channel_type = v_event.channel_type;

  if not found then
    raise exception 'INBOX_WEBHOOK_IDENTITY_MISMATCH';
  end if;

  select c.account_id into v_account_id
  from public.crm_contacts c
  where c.id = p_contact_id and c.owner_id = p_owner_id;

  if not found then
    raise exception 'CRM_CONTACT_NOT_FOUND';
  end if;

  v_payload := coalesce(v_event.payload, '{}'::jsonb);
  v_content := coalesce(v_payload->>'content', '');
  v_created_at := coalesce(nullif(v_payload->>'occurredAt', '')::timestamptz, v_event.received_at);

  select c.id into v_conversation_id
  from public.inbox_conversations c
  where c.owner_id = p_owner_id and c.contact_id = p_contact_id
    and c.status in ('open','pending')
  order by c.updated_at desc
  limit 1
  for update;

  if v_conversation_id is null then
    begin
      insert into public.inbox_conversations (
        owner_id, contact_id, account_id, status, unread_count, last_channel_type
      ) values (
        p_owner_id, p_contact_id, v_account_id, 'open', 0, v_event.channel_type
      ) returning id into v_conversation_id;
    exception when unique_violation then
      select c.id into v_conversation_id
      from public.inbox_conversations c
      where c.owner_id = p_owner_id and c.contact_id = p_contact_id
        and c.status in ('open','pending')
      order by c.updated_at desc
      limit 1
      for update;
    end;
  end if;

  if v_conversation_id is null then
    raise exception 'INBOX_CONVERSATION_CREATE_FAILED';
  end if;

  insert into public.inbox_messages (
    owner_id, conversation_id, customer_identity_id, channel_connection_id,
    channel_type, direction, content_type, content, external_message_id,
    status, created_at, metadata
  ) values (
    p_owner_id, v_conversation_id, p_identity_id, v_event.channel_connection_id,
    v_event.channel_type, 'inbound',
    coalesce(nullif(v_payload->>'contentType',''), 'text'),
    v_content, v_payload->>'messageId', 'received', v_created_at,
    coalesce(v_payload->'metadata', '{}'::jsonb)
  )
  on conflict (channel_connection_id, external_message_id)
    where channel_connection_id is not null and external_message_id is not null
  do nothing
  returning id into v_message_id;

  if v_message_id is not null then
    update public.inbox_conversations
    set last_message_at = v_created_at,
        last_channel_type = v_event.channel_type,
        last_message_preview = left(v_content, 500),
        unread_count = unread_count + 1
    where id = v_conversation_id and owner_id = p_owner_id;

    update public.inbox_customer_identities
    set external_display_name = coalesce(nullif(v_payload->>'displayName',''), external_display_name),
        external_username = coalesce(nullif(v_payload->>'username',''), external_username),
        last_seen_at = v_created_at
    where id = p_identity_id and owner_id = p_owner_id;
  end if;

  update public.inbox_webhook_events
  set status = 'processed', payload = '{}'::jsonb,
      processed_at = now(), error_code = null
  where id = p_event_id and owner_id = p_owner_id;

  return jsonb_build_object(
    'conversation_id', v_conversation_id,
    'message_id', v_message_id,
    'inserted', v_message_id is not null
  );
end;
$$;

revoke all on function public.inbox_process_webhook_event(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.inbox_process_webhook_event(uuid, uuid, uuid, uuid) to service_role;
