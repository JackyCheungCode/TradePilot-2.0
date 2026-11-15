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
    perform vault.update_secret(existing_id, p_secret, p_name, coalesce(p_description, 'TradePilot integration credential'), null);
    result_id := existing_id;
  end if;
  return result_id;
end;
$$;
revoke all on function public.tradepilot_secret_upsert(text, text, text) from public, anon, authenticated;
grant execute on function public.tradepilot_secret_upsert(text, text, text) to service_role;
