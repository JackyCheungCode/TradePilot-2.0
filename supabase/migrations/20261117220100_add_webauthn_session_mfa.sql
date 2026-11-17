-- TradePilot WebAuthn MFA: private credential store, one-time challenges, session grants,
-- and restrictive RLS enforcement for direct Supabase Data API access.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists private.webauthn_credentials (
  credential_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  public_key text not null,
  counter bigint not null default 0 check (counter >= 0),
  transports text[] not null default '{}',
  device_type text not null default 'unknown',
  backed_up boolean not null default false,
  friendly_name text not null default 'TradePilot biometric device',
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
create index if not exists webauthn_challenges_expiry_idx
  on private.webauthn_challenges(expires_at);

create table if not exists private.webauthn_session_grants (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  credential_id text not null references private.webauthn_credentials(credential_id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(user_id, session_id)
);
create index if not exists webauthn_session_grants_expiry_idx
  on private.webauthn_session_grants(expires_at);

alter table private.webauthn_mfa_preferences enable row level security;
alter table private.webauthn_credentials enable row level security;
alter table private.webauthn_challenges enable row level security;
alter table private.webauthn_session_grants enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;
grant all on all tables in schema private to service_role;

create or replace function public.tradepilot_webauthn_is_enabled(p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select s.enabled from private.webauthn_mfa_preferences s where s.user_id = p_user_id), false);
$$;

create or replace function public.tradepilot_webauthn_has_verified_totp(p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $totp$
  select exists (
    select 1 from auth.mfa_factors f
    where f.user_id=p_user_id and f.factor_type='totp' and f.status='verified'
  );
$totp$;

create or replace function public.tradepilot_webauthn_get_credentials(p_user_id uuid)
returns table(credential_id text, public_key text, counter bigint, transports text[], friendly_name text)
language sql stable security definer set search_path = ''
as $$
  select c.credential_id, c.public_key, c.counter, c.transports, c.friendly_name
  from private.webauthn_credentials c
  where c.user_id = p_user_id and c.revoked_at is null
  order by c.created_at;
$$;

create or replace function public.tradepilot_webauthn_store_challenge(
  p_user_id uuid, p_session_id uuid, p_purpose text, p_challenge text, p_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if p_purpose not in ('registration','authentication')
     or p_expires_at <= now() or p_expires_at > now() + interval '6 minutes'
     or length(p_challenge) < 20 or length(p_challenge) > 256 then
    raise exception 'invalid WebAuthn challenge parameters';
  end if;
  delete from private.webauthn_challenges where expires_at < now() or consumed_at is not null;
  insert into private.webauthn_challenges(user_id,session_id,purpose,challenge,expires_at)
  values(p_user_id,p_session_id,p_purpose,p_challenge,p_expires_at)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.tradepilot_webauthn_consume_challenge(
  p_id uuid, p_user_id uuid, p_session_id uuid, p_purpose text
) returns table(challenge text) language sql security definer set search_path = ''
as $$
  update private.webauthn_challenges c
  set consumed_at = now()
  where c.id = p_id and c.user_id = p_user_id and c.session_id = p_session_id
    and c.purpose = p_purpose and c.consumed_at is null and c.expires_at > now()
  returning c.challenge;
$$;

create or replace function public.tradepilot_webauthn_save_credential(
  p_user_id uuid, p_credential_id text, p_public_key text, p_counter bigint,
  p_transports text[], p_device_type text, p_backed_up boolean, p_friendly_name text
) returns void language plpgsql security definer set search_path = ''
as $$
begin
  if length(p_credential_id) < 8 or length(p_credential_id) > 1024
     or length(p_public_key) < 16 or p_counter < 0 then
    raise exception 'invalid WebAuthn credential';
  end if;
  insert into private.webauthn_credentials(
    credential_id,user_id,public_key,counter,transports,device_type,backed_up,friendly_name
  ) values (
    p_credential_id,p_user_id,p_public_key,p_counter,coalesce(p_transports,'{}'),
    coalesce(p_device_type,'unknown'),coalesce(p_backed_up,false),
    left(coalesce(nullif(trim(p_friendly_name),''),'TradePilot biometric device'),80)
  );
end;
$$;

create or replace function public.tradepilot_webauthn_set_enabled(p_user_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_enabled and (
    select count(*) from private.webauthn_credentials c
    where c.user_id = p_user_id and c.revoked_at is null
  ) < 2 then
    raise exception 'at least two active WebAuthn credentials are required before enabling MFA';
  end if;
  insert into private.webauthn_mfa_preferences(user_id,enabled,updated_at)
  values(p_user_id,p_enabled,now())
  on conflict(user_id) do update set enabled=excluded.enabled, updated_at=now();
  if not p_enabled then
    update private.webauthn_session_grants set revoked_at=coalesce(revoked_at,now())
    where user_id=p_user_id;
  end if;
end;
$$;

create or replace function public.tradepilot_webauthn_update_counter(
  p_user_id uuid, p_credential_id text, p_counter bigint
) returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if p_counter < 0 then return false; end if;
  update private.webauthn_credentials c
  set counter=p_counter,last_used_at=now()
  where c.user_id=p_user_id and c.credential_id=p_credential_id and c.revoked_at is null
    and ((c.counter=0 and p_counter=0) or p_counter>c.counter);
  get diagnostics v_count = row_count;
  return v_count=1;
end;
$$;

create or replace function public.tradepilot_webauthn_grant_session(
  p_user_id uuid, p_session_id uuid, p_credential_id text, p_expires_at timestamptz
) returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_expires_at <= now() or p_expires_at > now() + interval '13 hours'
     or not exists (
       select 1 from private.webauthn_credentials c
       where c.user_id=p_user_id and c.credential_id=p_credential_id and c.revoked_at is null
     ) then
    raise exception 'invalid WebAuthn session grant';
  end if;
  insert into private.webauthn_session_grants(user_id,session_id,credential_id,expires_at,revoked_at)
  values(p_user_id,p_session_id,p_credential_id,p_expires_at,null)
  on conflict(user_id,session_id) do update
    set credential_id=excluded.credential_id,expires_at=excluded.expires_at,revoked_at=null,granted_at=now();
end;
$$;

create or replace function public.tradepilot_webauthn_has_grant(p_user_id uuid, p_session_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.webauthn_session_grants g
    join private.webauthn_credentials c
      on c.credential_id=g.credential_id and c.user_id=g.user_id and c.revoked_at is null
    where g.user_id=p_user_id and g.session_id=p_session_id
      and g.revoked_at is null and g.expires_at > now()
  );
$$;

create or replace function public.tradepilot_webauthn_revoke_credential(p_user_id uuid,p_credential_id text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  update private.webauthn_credentials
  set revoked_at=coalesce(revoked_at,now())
  where user_id=p_user_id and credential_id=p_credential_id and revoked_at is null;
  get diagnostics v_count = row_count;
  if v_count=1 then
    update private.webauthn_session_grants set revoked_at=coalesce(revoked_at,now())
    where user_id=p_user_id and credential_id=p_credential_id;
    if not exists (select 1 from private.webauthn_credentials c where c.user_id=p_user_id and c.revoked_at is null) then
      update private.webauthn_mfa_preferences set enabled=false,updated_at=now() where user_id=p_user_id;
      update private.webauthn_session_grants set revoked_at=coalesce(revoked_at,now()) where user_id=p_user_id;
    end if;
  end if;
  return v_count=1;
end;
$$;

create or replace function private.tradepilot_webauthn_session_authorized()
returns boolean language sql stable security definer set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when not coalesce((
      select s.enabled from private.webauthn_mfa_preferences s where s.user_id=auth.uid()
    ),false) then (
      not exists (
        select 1 from auth.mfa_factors f
        where f.user_id=auth.uid() and f.factor_type='totp' and f.status='verified'
      ) or auth.jwt()->>'aal'='aal2'
    )
    else exists (
      select 1
      from private.webauthn_session_grants g
      join private.webauthn_credentials c
        on c.credential_id=g.credential_id and c.user_id=g.user_id and c.revoked_at is null
      where g.user_id=auth.uid()
        and g.session_id=nullif(auth.jwt()->>'session_id','')::uuid
        and g.revoked_at is null and g.expires_at>now()
    )
  end;
$$;

revoke all on function public.tradepilot_webauthn_is_enabled(uuid) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_has_verified_totp(uuid) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_get_credentials(uuid) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_store_challenge(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_consume_challenge(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_save_credential(uuid,text,text,bigint,text[],text,boolean,text) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_set_enabled(uuid,boolean) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_update_counter(uuid,text,bigint) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_grant_session(uuid,uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_has_grant(uuid,uuid) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_revoke_credential(uuid,text) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_is_enabled(uuid) from public, anon, authenticated;
revoke all on function public.tradepilot_webauthn_has_grant(uuid,uuid) from public, anon, authenticated;
grant execute on function public.tradepilot_webauthn_get_credentials(uuid) to service_role;
grant execute on function public.tradepilot_webauthn_store_challenge(uuid,uuid,text,text,timestamptz) to service_role;
grant execute on function public.tradepilot_webauthn_consume_challenge(uuid,uuid,uuid,text) to service_role;
grant execute on function public.tradepilot_webauthn_save_credential(uuid,text,text,bigint,text[],text,boolean,text) to service_role;
grant execute on function public.tradepilot_webauthn_set_enabled(uuid,boolean) to service_role;
grant execute on function public.tradepilot_webauthn_update_counter(uuid,text,bigint) to service_role;
grant execute on function public.tradepilot_webauthn_grant_session(uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.tradepilot_webauthn_revoke_credential(uuid,text) to service_role;

revoke all on function private.tradepilot_webauthn_session_authorized() from public, anon;
grant execute on function private.tradepilot_webauthn_session_authorized() to authenticated;

-- The preceding migration already installs the restrictive session policy on all public RLS tables.

-- Storage is a separate exposed API surface; apply the same session gate where
-- authenticated users already have object policies.
do $$
begin
  if to_regclass('storage.objects') is not null
     and exists (
       select 1 from pg_class c
       where c.oid=to_regclass('storage.objects') and c.relrowsecurity
     )
     and exists (
       select 1 from pg_policies p
       where p.schemaname='storage' and p.tablename='objects'
         and ('authenticated'=any(p.roles) or 'public'=any(p.roles))
     ) then
    execute 'drop policy if exists tradepilot_webauthn_session_gate on storage.objects';
    execute 'create policy tradepilot_webauthn_session_gate on storage.objects as restrictive for all to authenticated using ((select private.tradepilot_webauthn_session_authorized())) with check ((select private.tradepilot_webauthn_session_authorized()))';
  end if;
end;
$$;

-- RLS is bypassed inside SECURITY DEFINER routines. A write trigger closes that
-- alternate path for authenticated sessions while leaving service-role and
-- direct administrative database operations unchanged.
create or replace function private.tradepilot_webauthn_enforce_write_gate()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := auth.jwt()->>'role';
begin
  if v_role is distinct from 'authenticated' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if not private.tradepilot_webauthn_session_authorized() then
    raise exception 'WebAuthn MFA verification required for this session'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function private.tradepilot_webauthn_enforce_write_gate() from public, anon, authenticated;

do $$
declare r record;
begin
  for r in
    select distinct t.tablename
    from pg_tables t
    where t.schemaname='public'
      and exists (
        select 1 from pg_policies p
        where p.schemaname=t.schemaname and p.tablename=t.tablename
          and ('authenticated'=any(p.roles) or 'public'=any(p.roles))
      )
  loop
    execute format('drop trigger if exists tradepilot_webauthn_write_gate on public.%I', r.tablename);
    execute format(
      'create trigger tradepilot_webauthn_write_gate before insert or update or delete on public.%I for each row execute function private.tradepilot_webauthn_enforce_write_gate()',
      r.tablename
    );
  end loop;

  if to_regclass('storage.objects') is not null
     and exists (
       select 1 from pg_policies p
       where p.schemaname='storage' and p.tablename='objects'
         and ('authenticated'=any(p.roles) or 'public'=any(p.roles))
     ) then
    execute 'drop trigger if exists tradepilot_webauthn_write_gate on storage.objects';
    execute 'create trigger tradepilot_webauthn_write_gate before insert or update or delete on storage.objects for each row execute function private.tradepilot_webauthn_enforce_write_gate()';
  end if;
end;
$$;

-- Refresh PostgREST's function/schema cache after the new RPCs are created.
notify pgrst, 'reload schema';
