create or replace function public.confirm_quote_status_transition(
  p_quote_id uuid,
  p_expected_status text,
  p_target_status text
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_db_status text;
  v_content jsonb;
  v_current text;
  v_version integer;
  v_next_content jsonb;
  v_next_db_status text;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p_target_status not in ('accepted','rejected') then
    raise exception 'Unsupported quote transition';
  end if;

  select status,coalesce(content,'{}'::jsonb),current_version
    into v_db_status,v_content,v_version
  from public.trade_documents
  where id=p_quote_id and owner_id=v_owner and document_type='quotation'
  for update;

  if not found then raise exception 'Quote not found or access denied'; end if;

  v_current := coalesce(nullif(v_content->>'quote_status',''),
    case v_db_status when 'draft' then 'draft' when 'issued' then 'sent'
      when 'approved' then 'accepted' when 'void' then 'cancelled' else v_db_status end);

  if v_current is distinct from p_expected_status then
    raise exception 'Quote status changed; reload before confirming';
  end if;
  if v_current not in ('sent','viewed') then
    raise exception 'Only sent or viewed quotes can be accepted or rejected';
  end if;

  v_next_content := jsonb_set(v_content,'{quote_status}',to_jsonb(p_target_status),true);
  v_next_db_status := case when p_target_status='accepted' then 'approved' else v_db_status end;

  update public.trade_documents
  set content=v_next_content,status=v_next_db_status,updated_at=now()
  where id=p_quote_id and owner_id=v_owner;

  insert into public.trade_document_events(owner_id,document_id,event_type,payload)
  values(v_owner,p_quote_id,p_target_status,jsonb_build_object('version',v_version,'atomic',true));

  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    v_owner,'quote',p_quote_id,'quote_status_changed',v_current,p_target_status,
    false,'not_required',v_owner,
    case when p_target_status='accepted' then '人工记录客户接受报价' else '人工记录客户拒绝报价' end,
    jsonb_build_object('version',v_version,'atomic',true)
  );

  return p_quote_id;
end;
$$;

revoke all on function public.confirm_quote_status_transition(uuid,text,text) from public, anon;
grant execute on function public.confirm_quote_status_transition(uuid,text,text) to authenticated;
