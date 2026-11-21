alter function public.set_crm_opportunity_updated_at() set search_path = public, pg_temp;
alter function public.log_crm_opportunity_stage_change() set search_path = public, pg_temp;