-- Intelligence monitoring core tables.
-- Applied to the TradePilot production Supabase project on 2026-11-22.
create table if not exists public.monitoring_objects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 platform text not null check(platform in ('facebook','instagram','x','tiktok','youtube','reddit','google_maps','telegram','linkedin','forum','pinterest')),
 object_type text not null default 'auto' check(object_type in ('auto','page','person','group','channel','post','place','forum')),
 label text not null, source_url text not null, normalized_url text not null, is_active boolean not null default true,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_id,platform,normalized_url), unique(id,owner_id)
);
create table if not exists public.monitoring_tasks (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 task_code text not null, name text not null, status text not null default 'draft' check(status in ('draft','running','paused','error','completed','archived')),
 cadence_minutes integer not null default 60 check(cadence_minutes between 15 and 10080), config jsonb not null default '{}'::jsonb,
 started_at timestamptz, last_run_at timestamptz, next_run_at timestamptz,
 last_run_status text check(last_run_status is null or last_run_status in ('queued','running','succeeded','partial','failed','skipped')),
 last_result_count integer not null default 0 check(last_result_count>=0), last_error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_id,task_code), unique(id,owner_id)
);
create table if not exists public.monitoring_task_objects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 task_id uuid not null, object_id uuid not null, created_at timestamptz not null default now(), unique(task_id,object_id),
 foreign key(task_id,owner_id) references public.monitoring_tasks(id,owner_id) on delete cascade,
 foreign key(object_id,owner_id) references public.monitoring_objects(id,owner_id) on delete restrict
);
create table if not exists public.monitoring_runs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 task_id uuid not null, status text not null default 'queued' check(status in ('queued','running','succeeded','partial','failed','skipped')),
 provider text, started_at timestamptz, finished_at timestamptz,
 discovered_count integer not null default 0 check(discovered_count>=0), new_count integer not null default 0 check(new_count>=0),
 analyzed_count integer not null default 0 check(analyzed_count>=0), error_code text, error_message text,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
 foreign key(task_id,owner_id) references public.monitoring_tasks(id,owner_id) on delete cascade, unique(id,owner_id)
);
create table if not exists public.monitoring_items (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 task_id uuid not null, object_id uuid not null, run_id uuid not null,
 platform text not null check(platform in ('facebook','instagram','x','tiktok','youtube','reddit','google_maps','telegram','linkedin','forum','pinterest')),
 external_id text not null, content_type text not null check(content_type in ('post','comment','reply','review','video','thread','message')),
 author_name text, author_profile_url text, content_text text not null default '', source_url text,
 published_at timestamptz, captured_at timestamptz not null default now(), raw_data jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 foreign key(task_id,owner_id) references public.monitoring_tasks(id,owner_id) on delete cascade,
 foreign key(object_id,owner_id) references public.monitoring_objects(id,owner_id) on delete restrict,
 foreign key(run_id,owner_id) references public.monitoring_runs(id,owner_id) on delete cascade,
 unique(owner_id,platform,external_id), unique(id,owner_id)
);
create table if not exists public.monitoring_analyses (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 item_id uuid not null, intent_type text not null default 'unclassified',
 grade text not null default 'C' check(grade in ('S','A','B','C','unclassified')),
 score integer not null default 0 check(score between 0 and 100), is_purchase_intent boolean not null default false,
 rationale text not null default '', extracted_requirements jsonb not null default '{}'::jsonb,
 model text, analyzed_at timestamptz not null default now(), created_at timestamptz not null default now(),
 foreign key(item_id,owner_id) references public.monitoring_items(id,owner_id) on delete cascade, unique(item_id,owner_id)
);
create index if not exists monitoring_tasks_owner_status_idx on public.monitoring_tasks(owner_id,status,next_run_at);
create index if not exists monitoring_tasks_due_idx on public.monitoring_tasks(next_run_at) where status='running';
create index if not exists monitoring_task_objects_object_idx on public.monitoring_task_objects(object_id,owner_id);
create index if not exists monitoring_runs_task_created_idx on public.monitoring_runs(task_id,created_at desc);
create index if not exists monitoring_items_owner_captured_idx on public.monitoring_items(owner_id,captured_at desc);
create index if not exists monitoring_items_task_captured_idx on public.monitoring_items(task_id,captured_at desc);
create index if not exists monitoring_items_object_published_idx on public.monitoring_items(object_id,published_at desc);
create index if not exists monitoring_analyses_owner_grade_idx on public.monitoring_analyses(owner_id,grade,score desc);
create index if not exists monitoring_analyses_item_idx on public.monitoring_analyses(item_id);
do $$
declare t text;
begin
 foreach t in array array['monitoring_objects','monitoring_tasks','monitoring_task_objects','monitoring_runs','monitoring_items','monitoring_analyses'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated, service_role',t);
  execute format('drop policy if exists %I on public.%I',t||'_owner_select',t);
  execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = owner_id)',t||'_owner_select',t);
  execute format('drop policy if exists %I on public.%I',t||'_owner_insert',t);
  execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = owner_id)',t||'_owner_insert',t);
  execute format('drop policy if exists %I on public.%I',t||'_owner_update',t);
  execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)',t||'_owner_update',t);
  execute format('drop policy if exists %I on public.%I',t||'_owner_delete',t);
  execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = owner_id)',t||'_owner_delete',t);
 end loop;
end $$;
