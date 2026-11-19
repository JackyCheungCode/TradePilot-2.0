create or replace function public.tradepilot_secret_get(p_names text[])
returns table(name text, secret text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text;
begin
  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '')
  );
  if jwt_role is distinct from 'service_role' then
    raise exception 'service role required';
  end if;
  return query
    select ds.name::text, ds.decrypted_secret::text
    from vault.decrypted_secrets ds
    where ds.name = any(coalesce(p_names, array[]::text[]));
end;
$$;

create or replace function public.tradepilot_secret_upsert(p_name text, p_secret text, p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text;
  existing_id uuid;
  result_id uuid;
begin
  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '')
  );
  if jwt_role is distinct from 'service_role' then
    raise exception 'service role required';
  end if;
  if p_name !~ '^tradepilot_[a-z0-9_]{1,120}$' or length(p_secret) < 1 or length(p_secret) > 12000 then
    raise exception 'invalid secret name or value';
  end if;
  select s.id into existing_id from vault.secrets s where s.name = p_name limit 1;
  if existing_id is null then
    result_id := vault.create_secret(p_secret, p_name, coalesce(p_description, 'TradePilot integration credential'), null);
  else
    result_id := vault.update_secret(existing_id, p_secret, p_name, coalesce(p_description, 'TradePilot integration credential'), null);
  end if;
  return result_id;
end;
$$;

create or replace function public.tradepilot_secret_delete(p_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text;
  deleted_count integer;
begin
  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '')
  );
  if jwt_role is distinct from 'service_role' then
    raise exception 'service role required';
  end if;
  if p_name !~ '^tradepilot_[a-z0-9_]{1,120}$' then
    raise exception 'invalid secret name';
  end if;
  delete from vault.secrets where name = p_name;
  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.tradepilot_secret_get(text[]) from public, anon, authenticated;
revoke all on function public.tradepilot_secret_upsert(text, text, text) from public, anon, authenticated;
revoke all on function public.tradepilot_secret_delete(text) from public, anon, authenticated;
grant execute on function public.tradepilot_secret_get(text[]) to service_role;
grant execute on function public.tradepilot_secret_upsert(text, text, text) to service_role;
grant execute on function public.tradepilot_secret_delete(text) to service_role;
