
alter table public.crm_opportunities
  add column if not exists opportunity_type text not null default 'new_business',
  add column if not exists qualification_status text not null default 'pending',
  add column if not exists priority text not null default 'normal',
  add column if not exists actual_amount numeric(18,2),
  add column if not exists expected_quantity numeric(18,3),
  add column if not exists expected_margin numeric(18,2),
  add column if not exists expected_margin_rate numeric(7,4),
  add column if not exists competitors jsonb not null default '[]'::jsonb,
  add column if not exists competitive_product text,
  add column if not exists competitive_advantages text,
  add column if not exists competitive_disadvantages text,
  add column if not exists lost_notes text,
  add column if not exists product_items jsonb not null default '[]'::jsonb,
  add column if not exists tags text[] not null default '{}',
  add column if not exists first_contact_date date,
  add column if not exists last_contact_at timestamptz,
  add column if not exists next_activity_at timestamptz,
  add column if not exists next_activity_type text,
  add column if not exists won_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists follow_up_summary text,
  add column if not exists internal_notes text,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

alter table public.crm_opportunities
  add constraint crm_opportunities_type_check check (opportunity_type in ('new_business','existing_customer','repeat','channel_partner')) not valid,
  add constraint crm_opportunities_qualification_check check (qualification_status in ('pending','qualified','disqualified')) not valid,
  add constraint crm_opportunities_priority_check check (priority in ('low','normal','high','urgent')) not valid;

create index if not exists crm_opportunities_owner_created_idx on public.crm_opportunities(owner_id, created_at desc);
create index if not exists crm_opportunities_owner_stage_idx on public.crm_opportunities(owner_id, stage);
create index if not exists crm_opportunities_account_idx on public.crm_opportunities(account_id);

create table if not exists public.crm_opportunity_stage_history (
 id uuid primary key default gen_random_uuid(),
 opportunity_id uuid not null references public.crm_opportunities(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 from_stage text,
 to_stage text not null,
 changed_by uuid references auth.users(id) on delete set null,
 changed_at timestamptz not null default now(),
 note text
);
create index if not exists crm_opportunity_stage_history_opp_idx on public.crm_opportunity_stage_history(opportunity_id, changed_at desc);

alter table public.crm_opportunities enable row level security;
alter table public.crm_opportunity_stage_history enable row level security;

do $$
begin
 if not exists (select 1 from pg_policies where schemaname='public' and tablename='crm_opportunities' and policyname='crm_opportunities_owner_access') then
  create policy crm_opportunities_owner_access on public.crm_opportunities for all to authenticated
   using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
 end if;
 if not exists (select 1 from pg_policies where schemaname='public' and tablename='crm_opportunity_stage_history' and policyname='crm_opportunity_stage_history_owner_access') then
  create policy crm_opportunity_stage_history_owner_access on public.crm_opportunity_stage_history for all to authenticated
   using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
 end if;
end $$;

grant select, insert, update, delete on public.crm_opportunities to authenticated;
grant select, insert, update, delete on public.crm_opportunity_stage_history to authenticated;

create or replace function public.set_crm_opportunity_updated_at()
returns trigger language plpgsql as $$
begin
 new.updated_at = now();
 return new;
end;
$$;
drop trigger if exists crm_opportunities_updated_at on public.crm_opportunities;
create trigger crm_opportunities_updated_at before update on public.crm_opportunities
for each row execute function public.set_crm_opportunity_updated_at();

create or replace function public.log_crm_opportunity_stage_change()
returns trigger language plpgsql as $$
begin
 if tg_op = 'INSERT' then
  insert into public.crm_opportunity_stage_history(opportunity_id,owner_id,from_stage,to_stage,changed_by,note)
  values(new.id,new.owner_id,null,new.stage,auth.uid(),'商机创建');
 elsif new.stage is distinct from old.stage then
  insert into public.crm_opportunity_stage_history(opportunity_id,owner_id,from_stage,to_stage,changed_by)
  values(new.id,new.owner_id,old.stage,new.stage,auth.uid());
 end if;
 return new;
end;
$$;
drop trigger if exists crm_opportunities_stage_history on public.crm_opportunities;
create trigger crm_opportunities_stage_history after insert or update of stage on public.crm_opportunities
for each row execute function public.log_crm_opportunity_stage_change();
