create or replace function public.capture_quote_issue_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text;
  v_to text;
begin
  if new.document_type <> 'quotation' or new.status <> 'issued' or old.status is not distinct from new.status then
    return new;
  end if;
  v_from := coalesce(nullif(old.content->>'quote_status',''),
    case old.status when 'draft' then 'draft' when 'issued' then 'sent'
      when 'approved' then 'accepted' when 'void' then 'cancelled' else old.status end);
  v_to := coalesce(nullif(new.content->>'quote_status',''),'sent');

  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    new.owner_id,'quote',new.id,'quote_status_changed',v_from,v_to,
    false,'not_required',coalesce(auth.uid(),new.owner_id),
    '报价单已发送',
    jsonb_build_object('document_number',new.document_number,'version',new.current_version,'atomic',true)
  );
  return new;
end;
$$;

drop trigger if exists trg_quote_issue_lifecycle_event on public.trade_documents;
create trigger trg_quote_issue_lifecycle_event
after update of status on public.trade_documents
for each row when (old.status is distinct from new.status)
execute function public.capture_quote_issue_lifecycle_event();
