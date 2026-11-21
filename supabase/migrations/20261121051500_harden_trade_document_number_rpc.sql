create or replace function public.next_trade_document_number(
  p_owner_id uuid,
  p_sequence_key text,
  p_sequence_year integer
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_owner uuid := auth.uid();
  v_role text := coalesce(auth.jwt()->>'role','');
  v_value bigint;
begin
  if p_owner_id is null or (v_owner is distinct from p_owner_id and v_role <> 'service_role') then
    raise exception 'Not authorized to allocate a document number for this account'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_sequence_key),'') = '' or p_sequence_year < 2000 or p_sequence_year > 9999 then
    raise exception 'Invalid document number sequence key or year'
      using errcode = '22023';
  end if;

  insert into public.trade_document_number_sequences(
    owner_id,sequence_key,sequence_year,next_value
  ) values (
    p_owner_id,p_sequence_key,p_sequence_year,2
  )
  on conflict(owner_id,sequence_key,sequence_year)
  do update set
    next_value=public.trade_document_number_sequences.next_value+1,
    updated_at=now()
  returning next_value-1 into v_value;

  return v_value;
end;
$function$;

revoke all on function public.next_trade_document_number(uuid,text,integer) from public, anon;
grant execute on function public.next_trade_document_number(uuid,text,integer) to authenticated, service_role;
