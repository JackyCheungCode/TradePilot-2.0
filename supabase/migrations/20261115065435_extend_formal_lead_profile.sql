alter table public.leads
  add column if not exists lead_number text not null default ('LD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  add column if not exists profile jsonb not null default '{}'::jsonb;

create unique index if not exists leads_lead_number_key on public.leads(lead_number);

create or replace function public.create_formal_lead(p_lead jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_profile jsonb := coalesce(p_lead->'profile', '{}'::jsonb);
  v_record_id uuid := nullif(p_lead->>'discovery_record_id', '')::uuid;
  v_entity_id uuid;
  v_existing public.leads%rowtype;
  v_lead public.leads%rowtype;
  v_company text := nullif(trim(v_profile->>'company_name'), '');
  v_contact text := nullif(trim(v_profile->>'contact_name'), '');
  v_country text := upper(nullif(p_lead->>'country_code', ''));
  v_lead_name text;
begin
  if v_owner is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if v_country is null or length(v_country) <> 2 then
    raise exception 'COUNTRY_REQUIRED' using errcode = '22023';
  end if;
  if coalesce(v_profile->>'lead_type', 'company') = 'company' and v_company is null then
    raise exception 'COMPANY_NAME_REQUIRED' using errcode = '22023';
  end if;
  if coalesce(v_profile->>'lead_type', 'company') = 'person' and v_contact is null then
    raise exception 'CONTACT_NAME_REQUIRED' using errcode = '22023';
  end if;

  if v_record_id is not null then
    select entity_id into v_entity_id
      from public.discovery_records
      where id = v_record_id and owner_id = v_owner
      for update;
    if not found then
      raise exception 'DISCOVERY_RECORD_NOT_FOUND' using errcode = 'P0002';
    end if;
    select * into v_existing
      from public.leads
      where owner_id = v_owner and discovery_record_id = v_record_id
      limit 1;
    if found then
      return jsonb_build_object('id', v_existing.id, 'lead_number', v_existing.lead_number, 'already_exists', true);
    end if;
  end if;

  v_lead_name := case
    when v_company is not null and v_contact is not null then v_company || ' - ' || v_contact
    when v_company is not null then v_company
    else v_contact
  end;

  insert into public.leads (
    owner_id, name, country_code, address, phone, email, website,
    status, dedupe_key, is_formal, discovery_record_id, entity_id,
    business_type, confidence_score, profile
  ) values (
    v_owner,
    v_lead_name,
    v_country,
    nullif(v_profile->>'street_address', ''),
    nullif(v_profile->>'primary_phone', ''),
    nullif(v_profile->>'primary_email', ''),
    nullif(v_profile->>'website', ''),
    'draft',
    case when v_record_id is null then 'manual:' || gen_random_uuid()::text else 'discovery:' || v_record_id::text end,
    true,
    v_record_id,
    v_entity_id,
    nullif(v_profile->>'company_type', ''),
    null,
    v_profile
  ) returning * into v_lead;

  if v_record_id is not null then
    update public.discovery_records
      set status = 'promoted', lead_id = v_lead.id, updated_at = now()
      where id = v_record_id and owner_id = v_owner;
  end if;

  return jsonb_build_object('id', v_lead.id, 'lead_number', v_lead.lead_number, 'already_exists', false);
end;
$$;

grant execute on function public.create_formal_lead(jsonb) to authenticated;