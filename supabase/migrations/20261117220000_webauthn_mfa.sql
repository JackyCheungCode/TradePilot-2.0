-- TradePilot session-bound WebAuthn MFA.
-- This migration is intentionally additive. It does not enable MFA for any user.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create table if not exists private.webauthn_mfa_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.webauthn_credentials (
  credential_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_type text,
  backed_up boolean not null default false,
  friendly_name text not null default 'Security key',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists webauthn_credentials_user_active_idx
  on private.webauthn_credentials(user_id) where revoked_at is null;

create table if not exists private.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  purpose text not null check (purpose in ('registration','authentication')),
  challenge text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists webauthn_challenges_expiry_idx on private.webauthn_challenges(expires_at);

create table if not exists private.webauthn_session_grants (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  credential_id text not null references private.webauthn_credentials(credential_id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  primary key (user_id, session_id)
);
create index if not exists webauthn_session_grants_expiry_idx
  on private.webauthn_session_grants(expires_at) where revoked_at is null;

revoke all on all tables in schema private from public, anon, authenticated;
grant all on all tables in schema private to service_role;

create or replace function public.tradepilot_webauthn_store_challenge(
  p_user_id uuid, p_session_id uuid, p_purpose text, p_challenge text, p_expires_at timestamptz
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_purpose not in ('registration','authentication') or p_expires_at <= now() or p_expires_at > now() + interval '10 minutes' then
    raise exception 'invalid challenge parameters' using errcode = '22023';
  end if;
  delete from private.webauthn_challenges where expires_at < now() or consumed_at is not null;
  insert into private.webauthn_challenges(user_id,session_id,purpose,challenge,expires_at)
  values(p_user_id,p_session_id,p_purpose,p_challenge,p_expires_at) returning id into v_id;
  return v_id;
end $$;

create or replace function public.tradepilot_webauthn_consume_challenge(
  p_id uuid, p_user_id uuid, p_session_id uuid, p_purpose text
) returns table(challenge text)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    update private.webauthn_challenges c
       set consumed_at = now()
     where c.id = p_id and c.user_id = p_user_id and c.session_id = p_session_id
       and c.purpose = p_purpose and c.consumed_at is null and c.expires_at > now()
    returning c.challenge;
end $$;

create or replace function public.tradepilot_webauthn_get_credentials(p_user_id uuid)
returns table(credential_id text, public_key text, counter bigint, transports text[], friendly_name text)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select c.credential_id,c.public_key,c.counter,c.transports,c.friendly_name
    from private.webauthn_credentials c where c.user_id=p_user_id and c.revoked_at is null;
end $$;

create or replace function public.tradepilot_webauthn_save_credential(
  p_user_id uuid, p_credential_id text, p_public_key text, p_counter bigint,
  p_transports text[], p_device_type text, p_backed_up boolean, p_friendly_name text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into private.webauthn_credentials(user_id,credential_id,public_key,counter,transports,device_type,backed_up,friendly_name)
  values(p_user_id,p_credential_id,p_public_key,p_counter,coalesce(p_transports,'{}'),p_device_type,p_backed_up,left(coalesce(nullif(trim(p_friendly_name),''),'Security key'),80))
  on conflict(credential_id) do update set
    public_key=excluded.public_key,counter=excluded.counter,transports=excluded.transports,
    device_type=excluded.device_type,backed_up=excluded.backed_up,friendly_name=excluded.friendly_name
  where private.webauthn_credentials.user_id=excluded.user_id;
end $$;

create or replace function public.tradepilot_webauthn_update_counter(
  p_user_id uuid, p_credential_id text, p_counter bigint
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  update private.webauthn_credentials set counter=p_counter,last_used_at=now()
   where user_id=p_user_id and credential_id=p_credential_id and revoked_at is null and p_counter >= counter;
  get diagnostics v_count = row_count;
  return v_count = 1;
end $$;

create or replace function public.tradepilot_webauthn_set_enabled(p_user_id uuid,p_enabled boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_enabled and not exists(select 1 from private.webauthn_credentials c where c.user_id=p_user_id and c.revoked_at is null) then
    raise exception 'a verified credential is required' using errcode = '22023';
  end if;
  insert into private.webauthn_mfa_preferences(user_id,enabled,updated_at)
  values(p_user_id,p_enabled,now())
  on conflict(user_id) do update set enabled=excluded.enabled,updated_at=now();
  if not p_enabled then
    update private.webauthn_session_grants set revoked_at=now() where user_id=p_user_id and revoked_at is null;
  end if;
end $$;

create or replace function public.tradepilot_webauthn_is_enabled(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select enabled from private.webauthn_mfa_preferences where user_id=p_user_id),false)
$$;

create or replace function public.tradepilot_webauthn_grant_session(
  p_user_id uuid,p_session_id uuid,p_credential_id text,p_expires_at timestamptz
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '24 hours' then
    raise exception 'invalid grant expiry' using errcode = '22023';
  end if;
  if not exists(select 1 from private.webauthn_credentials c where c.user_id=p_user_id and c.credential_id=p_credential_id and c.revoked_at is null) then
    raise exception 'credential not found' using errcode = '22023';
  end if;
  insert into private.webauthn_session_grants(user_id,session_id,credential_id,expires_at,revoked_at)
  values(p_user_id,p_session_id,p_credential_id,p_expires_at,null)
  on conflict(user_id,session_id) do update set credential_id=excluded.credential_id,
    granted_at=now(),expires_at=excluded.expires_at,revoked_at=null;
end $$;

create or replace function public.tradepilot_webauthn_has_grant(p_user_id uuid,p_session_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from private.webauthn_session_grants g
    join private.webauthn_mfa_preferences p on p.user_id=g.user_id and p.enabled
    join private.webauthn_credentials c on c.credential_id=g.credential_id and c.user_id=g.user_id and c.revoked_at is null
    where g.user_id=p_user_id and g.session_id=p_session_id and g.revoked_at is null and g.expires_at>now())
$$;

create or replace function public.tradepilot_webauthn_revoke_credential(p_user_id uuid,p_credential_id text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  update private.webauthn_credentials set revoked_at=now()
   where user_id=p_user_id and credential_id=p_credential_id and revoked_at is null;
  get diagnostics v_count = row_count;
  update private.webauthn_session_grants set revoked_at=now()
   where user_id=p_user_id and credential_id=p_credential_id and revoked_at is null;
  return v_count=1;
end $$;

create or replace function private.tradepilot_webauthn_session_authorized()
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid; v_session uuid; v_enabled boolean;
begin
  v_user := auth.uid();
  if v_user is null then return false; end if;
  v_session := nullif(auth.jwt()->>'session_id','')::uuid;
  if v_session is null then return false; end if;
  select coalesce(p.enabled,false) into v_enabled
    from private.webauthn_mfa_preferences p where p.user_id=v_user;
  if not coalesce(v_enabled,false) then return true; end if;
  return public.tradepilot_webauthn_has_grant(v_user,v_session);
exception when others then return false;
end $$;
revoke all on function private.tradepilot_webauthn_session_authorized() from public, anon;
grant execute on function private.tradepilot_webauthn_session_authorized() to authenticated;

revoke all on function public.tradepilot_webauthn_store_challenge(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_consume_challenge(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_get_credentials(uuid) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_save_credential(uuid,text,text,bigint,text[],text,boolean,text) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_update_counter(uuid,text,bigint) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_set_enabled(uuid,boolean) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_grant_session(uuid,uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_revoke_credential(uuid,text) from public, anon, authenticated;
grant execute on function public.tradepilot_webauthn_store_challenge(uuid,uuid,text,text,timestamptz) to service_role;
grant execute on function public.tradepilot_webauthn_consume_challenge(uuid,uuid,uuid,text) to service_role;
grant execute on function public.tradepilot_webauthn_get_credentials(uuid) to service_role;
grant execute on function public.tradepilot_webauthn_save_credential(uuid,text,text,bigint,text[],text,boolean,text) to service_role;
grant execute on function public.tradepilot_webauthn_update_counter(uuid,text,bigint) to service_role;
grant execute on function public.tradepilot_webauthn_set_enabled(uuid,boolean) to service_role;
grant execute on function public.tradepilot_webauthn_grant_session(uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.tradepilot_webauthn_revoke_credential(uuid,text) to service_role;
grant execute on function public.tradepilot_webauthn_is_enabled(uuid) to service_role;
grant execute on function public.tradepilot_webauthn_has_grant(uuid,uuid) to service_role;

-- Add a restrictive policy to every public base table. Existing permissive policies
-- remain unchanged; users without opted-in WebAuthn MFA retain existing behavior.
do $$
declare t record; policy_name text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity
  loop
    policy_name := 'tradepilot_webauthn_session_guard';
    if not exists(select 1 from pg_policies p where p.schemaname='public' and p.tablename=t.relname and p.policyname=policy_name) then
      execute format('create policy %I on public.%I as restrictive for all to authenticated using (private.tradepilot_webauthn_session_authorized()) with check (private.tradepilot_webauthn_session_authorized())',policy_name,t.relname);
    end if;
  end loop;
end $$;
