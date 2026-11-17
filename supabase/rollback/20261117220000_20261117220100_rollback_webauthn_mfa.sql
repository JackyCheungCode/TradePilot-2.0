-- Emergency rollback for WebAuthn MFA migrations 20261117220000 and 20261117220100.
-- Run only after stopping the new Worker release and confirming that no account
-- depends on WebAuthn MFA. This removes only objects introduced by those migrations.
begin;

do $rollback$
declare r record;
begin
  for r in
    select tablename from pg_policies
    where schemaname='public' and policyname='tradepilot_webauthn_session_guard'
  loop
    execute format('drop policy if exists %I on public.%I','tradepilot_webauthn_session_guard',r.tablename);
  end loop;

  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists tradepilot_webauthn_session_gate on storage.objects';
    execute 'drop trigger if exists tradepilot_webauthn_write_gate on storage.objects';
  end if;

  for r in
    select t.tablename
    from pg_tables t
    where t.schemaname='public'
      and exists (
        select 1 from pg_trigger tr
        join pg_class c on c.oid=tr.tgrelid
        join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname=t.tablename
          and tr.tgname='tradepilot_webauthn_write_gate'
      )
  loop
    execute format('drop trigger if exists tradepilot_webauthn_write_gate on public.%I',r.tablename);
  end loop;
end;
$rollback$;

drop function if exists private.tradepilot_webauthn_enforce_write_gate();
drop function if exists private.tradepilot_webauthn_session_authorized();

drop function if exists public.tradepilot_webauthn_has_verified_totp(uuid);
drop function if exists public.tradepilot_webauthn_is_enabled(uuid);
drop function if exists public.tradepilot_webauthn_get_credentials(uuid);
drop function if exists public.tradepilot_webauthn_store_challenge(uuid,uuid,text,text,timestamptz);
drop function if exists public.tradepilot_webauthn_consume_challenge(uuid,uuid,uuid,text);
drop function if exists public.tradepilot_webauthn_save_credential(uuid,text,text,bigint,text[],text,boolean,text);
drop function if exists public.tradepilot_webauthn_set_enabled(uuid,boolean);
drop function if exists public.tradepilot_webauthn_update_counter(uuid,text,bigint);
drop function if exists public.tradepilot_webauthn_grant_session(uuid,uuid,text,timestamptz);
drop function if exists public.tradepilot_webauthn_has_grant(uuid,uuid);
drop function if exists public.tradepilot_webauthn_revoke_credential(uuid,text);

drop table if exists private.webauthn_session_grants;
drop table if exists private.webauthn_challenges;
drop table if exists private.webauthn_credentials;
drop table if exists private.webauthn_mfa_preferences;

notify pgrst, 'reload schema';
commit;
