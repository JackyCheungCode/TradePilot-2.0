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
