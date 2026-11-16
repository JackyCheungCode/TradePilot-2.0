create or replace function public.confirm_opportunity_stage_transition(
  p_opportunity_id uuid,
  p_expected_stage text,
  p_target_stage text,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_current_stage text;
  v_position integer;
  v_probability integer;
  v_status text;
begin
  if v_owner is null then
    raise exception 'Authentication required';
  end if;

  select stage into v_current_stage
  from public.crm_opportunities
  where id = p_opportunity_id and owner_id = v_owner and is_archived = false
  for update;

  if not found then
    raise exception 'Opportunity not found or access denied';
  end if;
  if v_current_stage <> p_expected_stage then
    raise exception 'Opportunity stage changed; reload and review before confirming';
  end if;
  if v_current_stage in ('won','lost') then
    raise exception 'Terminal opportunity stage cannot be changed through normal transition';
  end if;
  if p_target_stage not in ('won','lost') then
    v_position := array_position(array['prospecting','qualification','needs_analysis','proposal','negotiation']::text[],v_current_stage);
    if v_position is null or array_position(array['prospecting','qualification','needs_analysis','proposal','negotiation']::text[],p_target_stage) <> v_position + 1 then
      raise exception 'Only the next sequential opportunity stage is allowed';
    end if;
  end if;
  if p_target_stage = 'lost' and coalesce(trim(p_note),'') = '' then
    raise exception 'Loss reason is required';
  end if;

  v_status := case when p_target_stage='won' then 'won' when p_target_stage='lost' then 'lost' else 'open' end;
  v_probability := case when p_target_stage='won' then 100 when p_target_stage='lost' then 0 else
    case p_target_stage when 'qualification' then 20 when 'needs_analysis' then 35 when 'proposal' then 55 when 'negotiation' then 80 else 10 end
  end;

  update public.crm_opportunities
  set stage = p_target_stage,
      status = v_status,
      probability = v_probability,
      forecast_probability = v_probability,
      forecast_category = case when v_status='won' then 'won' when v_status='lost' then 'lost' else 'pipeline' end,
      won_at = case when p_target_stage='won' then now() else won_at end,
      closed_at = case when p_target_stage in ('won','lost') then now() else closed_at end,
      actual_amount = case when p_target_stage='won' then coalesce(actual_amount,amount) else actual_amount end
  where id = p_opportunity_id and owner_id = v_owner;

  insert into public.business_transition_events(
    owner_id,record_type,record_id,event_type,from_status,to_status,
    gatekeeper_required,gatekeeper_status,actor_id,note,payload
  ) values (
    v_owner,'opportunity',p_opportunity_id,'gatekeeper_stage_confirmed',
    v_current_stage,p_target_stage,true,'approved',v_owner,
    coalesce(nullif(trim(p_note),''),'人工确认商机阶段变更'),
    jsonb_build_object('source','opportunity_detail','confirmed',true)
  );

  return p_opportunity_id;
end;
$$;

revoke all on function public.confirm_opportunity_stage_transition(uuid,text,text,text) from public, anon;
grant execute on function public.confirm_opportunity_stage_transition(uuid,text,text,text) to authenticated;