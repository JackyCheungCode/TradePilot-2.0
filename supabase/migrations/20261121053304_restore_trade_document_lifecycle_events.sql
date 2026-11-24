create or replace function public.capture_quote_created_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.document_type <> 'quotation' then return new; end if;
  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    new.owner_id,'quote',new.id,'quote_created',
    null,
    coalesce(nullif(new.content->>'quote_status',''),
      case new.status when 'draft' then 'draft' when 'issued' then 'sent'
        when 'approved' then 'accepted' when 'void' then 'cancelled' else new.status end),
    false,'not_required',coalesce(auth.uid(),new.owner_id),
    '报价单已创建',
    jsonb_build_object('document_number',new.document_number,'version',new.current_version,'atomic',true)
  );
  return new;
end;
$$;

drop trigger if exists trg_quote_created_lifecycle_event on public.trade_documents;
create trigger trg_quote_created_lifecycle_event
after insert on public.trade_documents
for each row execute function public.capture_quote_created_lifecycle_event();

create or replace function public.capture_sales_order_created_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_type <> 'sales' then return new; end if;
  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    new.owner_id,'sales_order',new.id,'sales_order_created',null,
    coalesce(nullif(new.metadata->'sales_order'->>'order_status',''),
      case new.status when 'draft' then 'draft' when 'active' then 'confirmed'
        when 'completed' then 'completed' when 'cancelled' then 'cancelled' else new.status end),
    false,'not_required',coalesce(auth.uid(),new.owner_id),
    '销售订单已创建',
    jsonb_build_object('order_number',new.order_number,'atomic',true)
  );
  return new;
end;
$$;

drop trigger if exists trg_sales_order_created_lifecycle_event on public.trade_orders;
create trigger trg_sales_order_created_lifecycle_event
after insert on public.trade_orders
for each row execute function public.capture_sales_order_created_lifecycle_event();


create or replace function public.capture_opportunity_created_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    new.owner_id,'opportunity',new.id,'opportunity_created',null,new.stage,
    false,'not_required',coalesce(auth.uid(),new.owner_id),
    '商机已创建',
    jsonb_build_object('opportunity_number',new.opportunity_number,'status',new.status,'atomic',true)
  );
  return new;
end;
$$;

drop trigger if exists trg_opportunity_created_lifecycle_event on public.crm_opportunities;
create trigger trg_opportunity_created_lifecycle_event
after insert on public.crm_opportunities
for each row execute function public.capture_opportunity_created_lifecycle_event();


create or replace function public.capture_quote_issue_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from text;
  v_to text;
  v_event_type text;
  v_note text;
begin
  if new.document_type <> 'quotation' then
    return new;
  end if;

  if new.current_version is distinct from old.current_version then
    v_from := coalesce(nullif(old.content->>'quote_status',''),
      case old.status when 'draft' then 'draft' when 'issued' then 'sent'
        when 'approved' then 'accepted' when 'void' then 'cancelled' else old.status end);
    v_to := coalesce(nullif(new.content->>'quote_status',''),
      case new.status when 'draft' then 'draft' when 'issued' then 'sent'
        when 'approved' then 'accepted' when 'void' then 'cancelled' else new.status end);
    v_event_type := case when new.status='issued' then 'quote_revision_issued' else 'quote_revision_created' end;
    v_note := case when new.status='issued'
      then '报价修订版本已更新并发送'
      else '已创建报价修订版本，当前版本为草稿' end;
  elsif new.status is distinct from old.status then
    if new.status='issued' then
      v_from := coalesce(nullif(old.content->>'quote_status',''),
        case old.status when 'draft' then 'draft' when 'issued' then 'sent'
          when 'approved' then 'accepted' when 'void' then 'cancelled' else old.status end);
      v_to := coalesce(nullif(new.content->>'quote_status',''),'sent');
      v_event_type := 'quote_status_changed';
      v_note := '报价单已发送';
    else
      return new;
    end if;
  else
    return new;
  end if;

  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    new.owner_id,'quote',new.id,v_event_type,v_from,v_to,
    false,'not_required',coalesce(auth.uid(),new.owner_id),
    v_note,
    jsonb_build_object('document_number',new.document_number,'version',new.current_version,'atomic',true)
  );
  return new;
end;
$$;

drop trigger if exists trg_quote_issue_lifecycle_event on public.trade_documents;
create trigger trg_quote_issue_lifecycle_event
after update of status,current_version on public.trade_documents
for each row when (
  old.status is distinct from new.status
  or old.current_version is distinct from new.current_version
)
execute function public.capture_quote_issue_lifecycle_event();
