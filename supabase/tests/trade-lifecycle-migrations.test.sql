\set ON_ERROR_STOP on
begin;

do $trade_lifecycle_test$
declare
  owner_a uuid := '10000000-0000-4000-8000-000000000001';
  owner_b uuid := '10000000-0000-4000-8000-000000000002';
  shipment_id uuid;
  prospect_id uuid;
  second_prospect_id uuid;
  lead_id uuid;
  payment_id uuid;
  quote_id uuid;
  shipment_status text;
  lifecycle_stage text;
  result jsonb;
  event_count integer;
  document_number bigint;
  error_message text;
begin
  insert into auth.users(id) values(owner_a),(owner_b) on conflict do nothing;
  perform set_config('request.jwt.claim.sub', owner_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_a,'role','authenticated','aal','aal2')::text, true);

  document_number := public.next_trade_document_number(owner_a,'ci_test',2026);
  if document_number < 1 then raise exception 'Document number sequence did not allocate a positive value'; end if;

  insert into public.trade_shipments(owner_id,order_id,planned_ship_date,owner_name)
  values(owner_a,gen_random_uuid(),current_date,'CI shipment')
  returning id into shipment_id;

  select count(*) into event_count from public.business_transition_events
  where owner_id=owner_a and record_type='shipment' and record_id=shipment_id and event_type='shipment_created';
  if event_count <> 1 then raise exception 'Shipment creation event was not captured'; end if;

  if has_function_privilege('authenticated','public.confirm_trade_payment(uuid)','EXECUTE') is false
     or has_function_privilege('anon','public.confirm_trade_payment(uuid)','EXECUTE') then
    raise exception 'Payment confirmation RPC grants are incorrect';
  end if;
  if has_function_privilege('authenticated','public.void_trade_payment(uuid,text)','EXECUTE') is false
     or has_function_privilege('anon','public.void_trade_payment(uuid,text)','EXECUTE') then
    raise exception 'Payment void RPC grants are incorrect';
  end if;
  if has_function_privilege('authenticated','public.allocate_confirmed_trade_payment(uuid,jsonb)','EXECUTE') is false
     or has_function_privilege('anon','public.allocate_confirmed_trade_payment(uuid,jsonb)','EXECUTE') then
    raise exception 'Payment allocation RPC grants are incorrect';
  end if;
  if has_function_privilege('authenticated','public.create_formal_lead(jsonb)','EXECUTE') is false
     or has_function_privilege('anon','public.create_formal_lead(jsonb)','EXECUTE') then
    raise exception 'Formal lead creation RPC grants are incorrect';
  end if;
  if not has_function_privilege('authenticated','public.next_trade_document_number(uuid,text,integer)','EXECUTE') then raise exception 'Authenticated role cannot allocate document numbers'; end if;
  if has_function_privilege('anon','public.next_trade_document_number(uuid,text,integer)','EXECUTE') then raise exception 'Anonymous role can allocate document numbers'; end if;

  perform public.confirm_shipment_status_transition(shipment_id,'draft','pending_booking','CI lifecycle test');
  select status into shipment_status from public.trade_shipments where id=shipment_id;
  if shipment_status <> 'pending_booking' then raise exception 'Shipment transition did not persist'; end if;

  select count(*) into event_count from public.business_transition_events
  where owner_id=owner_a and record_type='shipment' and record_id=shipment_id and event_type='shipment_status_changed';
  if event_count <> 1 then raise exception 'Shipment status event was not captured'; end if;

  perform set_config('request.jwt.claim.sub', owner_b::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_b,'role','authenticated','aal','aal2')::text, true);
  begin
    perform public.next_trade_document_number(owner_a,'ci_test',2026);
    raise exception 'TEST_EXPECTED_DENIAL: document number';
  exception when others then
    get stacked diagnostics error_message = message_text;
    if error_message = 'TEST_EXPECTED_DENIAL: document number' then raise; end if;
    if error_message not like '%Not authorized to allocate a document number%' then
      raise exception 'Unexpected cross-owner document number response: %',error_message;
    end if;
  end;
  begin
    perform public.confirm_shipment_status_transition(shipment_id,'pending_booking','booked','cross-owner test');
    raise exception 'TEST_EXPECTED_DENIAL: shipment';
  exception when others then
    get stacked diagnostics error_message = message_text;
    if error_message = 'TEST_EXPECTED_DENIAL: shipment' then raise; end if;
    if error_message not like '%Shipment not found or access denied%' then
      raise exception 'Unexpected cross-owner shipment response: %',error_message;
    end if;
  end;

  perform set_config('request.jwt.claim.sub', owner_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_a,'role','authenticated','aal','aal2')::text, true);

  insert into public.discovery_records(owner_id,name,dedupe_key)
  values(owner_a,'CI Prospect','ci-prospect-'||gen_random_uuid()::text)
  returning id into prospect_id;

  select count(*) into event_count from public.business_transition_events
  where owner_id=owner_a and record_type='prospect' and record_id=prospect_id and event_type='prospect_discovered';
  if event_count <> 1 then raise exception 'Prospect discovery event was not captured'; end if;

  perform public.confirm_prospect_review(owner_a,prospect_id);
  select raw_data->>'lifecycle_stage' into lifecycle_stage from public.discovery_records where id=prospect_id;
  if lifecycle_stage <> 'reviewed' then raise exception 'Prospect review did not advance lifecycle'; end if;

  perform public.record_prospect_contact_enrichment(
    owner_a,
    prospect_id,
    jsonb_build_object('lifecycle_stage','collected','contact_enrichment',jsonb_build_object('emails',jsonb_build_array('ci@example.test'))),
    'ci@example.test',
    null,
    null,
    true,
    '{}'::jsonb
  );

  result := public.promote_prospect_to_lead(owner_a,prospect_id);
  lead_id := (result->>'leadId')::uuid;
  if lead_id is null then raise exception 'Prospect promotion did not return a lead id'; end if;
  if not exists(select 1 from public.leads where id=lead_id and owner_id=owner_a and discovery_record_id=prospect_id) then
    raise exception 'Promoted lead was not created for the source prospect';
  end if;
  if not exists(select 1 from public.business_record_relations where owner_id=owner_a and source_record_id=prospect_id and target_record_id=lead_id and relation_type='converted_to') then
    raise exception 'Prospect-to-lead relationship was not created';
  end if;
  select count(*) into event_count from public.business_transition_events
  where owner_id=owner_a and record_type='prospect' and record_id=prospect_id
    and event_type in ('prospect_reviewed','prospect_collected','prospect_converted');
  if event_count <> 3 then raise exception 'Prospect lifecycle audit events are incomplete: %',event_count; end if;

  insert into public.discovery_records(owner_id,name,dedupe_key)
  values(owner_a,'CI Cross Owner Prospect','ci-cross-owner-'||gen_random_uuid()::text)
  returning id into second_prospect_id;

  perform set_config('request.jwt.claim.sub', owner_b::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_b,'role','authenticated','aal','aal2')::text, true);

  begin
    perform public.confirm_prospect_review(owner_b,second_prospect_id);
    raise exception 'TEST_EXPECTED_DENIAL: prospect review';
  exception when others then
    get stacked diagnostics error_message = message_text;
    if error_message = 'TEST_EXPECTED_DENIAL: prospect review' then raise; end if;
    if error_message not like '%Prospect not found or access denied%' then
      raise exception 'Unexpected cross-owner prospect review response: %',error_message;
    end if;
  end;

  begin
    perform public.promote_prospect_to_lead(owner_b,second_prospect_id);
    raise exception 'TEST_EXPECTED_DENIAL: prospect promotion';
  exception when others then
    get stacked diagnostics error_message = message_text;
    if error_message = 'TEST_EXPECTED_DENIAL: prospect promotion' then raise; end if;
    if error_message not like '%Prospect not found or access denied%' then
      raise exception 'Unexpected cross-owner prospect promotion response: %',error_message;
    end if;
  end;

  begin
    perform public.record_prospect_contact_enrichment(owner_b,second_prospect_id,'{}'::jsonb,null,null,null,false,'{}'::jsonb);
    raise exception 'TEST_EXPECTED_DENIAL: contact enrichment';
  exception when others then
    get stacked diagnostics error_message = message_text;
    if error_message = 'TEST_EXPECTED_DENIAL: contact enrichment' then raise; end if;
    if error_message not like '%Prospect not found or access denied%' then
      raise exception 'Unexpected cross-owner contact enrichment response: %',error_message;
    end if;
  end;

  begin
    perform public.finalize_prospect_contact_conversion(owner_b,second_prospect_id,gen_random_uuid(),gen_random_uuid(),'{}'::jsonb,'{}'::jsonb);
    raise exception 'TEST_EXPECTED_DENIAL: final conversion';
  exception when others then
    get stacked diagnostics error_message = message_text;
    if error_message = 'TEST_EXPECTED_DENIAL: final conversion' then raise; end if;
    if error_message not like '%Prospect not found or access denied%' then
      raise exception 'Unexpected cross-owner final conversion response: %',error_message;
    end if;
  end;

  perform set_config('request.jwt.claim.sub', owner_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_a,'role','authenticated','aal','aal2')::text, true);

  insert into public.trade_payments(
    owner_id,payment_date,owner_name,account_id,payer_name,currency,amount,net_received,payment_method,bank_account_id
  ) values (
    owner_a,current_date,'CI payment',gen_random_uuid(),'CI payer','USD',100,100,'wire',gen_random_uuid()
  ) returning id into payment_id;
  update public.trade_payments set status='confirmed',updated_by=owner_a where id=payment_id;
  update public.trade_payments set reconcile_status='部分核销',updated_by=owner_a where id=payment_id;
  if not exists(select 1 from public.business_transition_events where record_id=payment_id and event_type='payment_created') then
    raise exception 'Payment creation event was not captured';
  end if;
  if not exists(select 1 from public.business_transition_events where record_id=payment_id and event_type='payment_status_changed') then
    raise exception 'Payment status event was not captured';
  end if;
  if not exists(select 1 from public.business_transition_events where record_id=payment_id and event_type='payment_reconciliation_changed') then
    raise exception 'Payment reconciliation event was not captured';
  end if;

  insert into public.trade_documents(owner_id,document_type,document_number,title,content)
  values(owner_a,'quotation','QT-CI-0001','CI quotation',jsonb_build_object('quote_status','draft'))
  returning id into quote_id;
  update public.trade_documents
  set status='issued',content=jsonb_build_object('quote_status','sent')
  where id=quote_id;
  if not exists(select 1 from public.record_audit_events where owner_id=owner_a and record_type='trade_documents' and record_id=quote_id and event_type='created') then
    raise exception 'Generic record audit did not capture quotation creation';
  end if;
  if not exists(select 1 from public.record_audit_events where owner_id=owner_a and record_type='trade_documents' and record_id=quote_id and event_type='updated'
    and field_changes->'status'->>'old'='draft' and field_changes->'status'->>'new'='issued') then
    raise exception 'Generic record audit did not capture field-level quotation changes';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='record_activities_parent_owner_fk_idx')
    or not exists(select 1 from pg_indexes where schemaname='public' and indexname='record_activity_attachments_owner_fk_idx')
    or not exists(select 1 from pg_indexes where schemaname='public' and indexname='record_activity_tasks_assigned_to_idx')
    or not exists(select 1 from pg_indexes where schemaname='public' and indexname='record_audit_events_actor_id_idx')
    or not exists(select 1 from pg_indexes where schemaname='public' and indexname='record_followers_user_id_idx') then
    raise exception 'Activity foreign-key indexes are missing';
  end if;
  if has_table_privilege('authenticated','public.record_audit_events','UPDATE')
    or has_table_privilege('authenticated','public.record_audit_events','DELETE') then
    raise exception 'Authenticated users must not be able to mutate immutable audit events';
  end if;
  if not exists(select 1 from public.business_transition_events where record_id=quote_id and event_type='quote_created') then
    raise exception 'Quote creation event was not captured';
  end if;
  if not exists(select 1 from public.business_transition_events where record_id=quote_id and event_type='quote_status_changed') then
    raise exception 'Quote issue event was not captured';
  end if;

  insert into public.trade_orders(owner_id,order_number,order_type,title)
  values(owner_a,'SO-CI-0001','sales','CI sales order');
  if not exists(select 1 from public.business_transition_events where owner_id=owner_a and record_type='sales_order' and event_type='sales_order_created') then
    raise exception 'Sales order creation event was not captured';
  end if;

  insert into public.crm_opportunities(owner_id,account_id,name)
  values(owner_a,gen_random_uuid(),'CI opportunity');
  if not exists(select 1 from public.business_transition_events where owner_id=owner_a and record_type='opportunity' and event_type='opportunity_created') then
    raise exception 'Opportunity creation event was not captured';
  end if;
end
$trade_lifecycle_test$;

rollback;
