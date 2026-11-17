create table if not exists public.actor_registry (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  actor_id text not null,
  actor_name text not null default '',
  title text not null default '',
  description text not null default '',
  platforms text[] not null default '{}',
  capabilities text[] not null default '{}',
  latest_version text,
  quality_score numeric(5,2),
  stability_score numeric(5,2),
  status text not null default 'discovered' check (status in ('discovered','schema_ready','testing','enabled','paused','failed')),
  source_metadata jsonb not null default '{}'::jsonb,
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, actor_id)
);
create index if not exists actor_registry_owner_status_idx on public.actor_registry(owner_id,status);
create index if not exists actor_registry_platforms_idx on public.actor_registry using gin(platforms);
alter table public.actor_registry enable row level security;
drop policy if exists actor_registry_owner_all on public.actor_registry;
create policy actor_registry_owner_all on public.actor_registry for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table if not exists public.actor_schema_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  actor_id text not null,
  version text not null,
  input_schema jsonb not null,
  localized_schema jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(owner_id,actor_id,version)
);
create index if not exists actor_schema_versions_owner_actor_idx on public.actor_schema_versions(owner_id,actor_id,fetched_at desc);
alter table public.actor_schema_versions enable row level security;
drop policy if exists actor_schema_versions_owner_all on public.actor_schema_versions;
create policy actor_schema_versions_owner_all on public.actor_schema_versions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
