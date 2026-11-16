revoke all on public.business_transition_batches from anon, authenticated;
revoke all on public.business_record_relations from anon, authenticated;
revoke all on public.business_transition_events from anon, authenticated;
grant select, insert, update on public.business_transition_batches to authenticated;
grant select, insert on public.business_record_relations to authenticated;
grant select, insert on public.business_transition_events to authenticated;