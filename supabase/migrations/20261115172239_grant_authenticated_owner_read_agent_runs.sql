grant select on table public.agent_runs to authenticated;

create policy "agent_runs_select_own"
on public.agent_runs
for select
to authenticated
using ((select auth.uid()) = owner_id);
