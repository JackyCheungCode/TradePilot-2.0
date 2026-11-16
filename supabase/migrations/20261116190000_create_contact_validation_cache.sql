create table if not exists public.contact_validation_cache (
  kind text not null check (kind in ('email','phone','whatsapp')),
  value_hash text not null,
  status text not null check (status in ('pending','valid','invalid','risky','registered','not_registered','unknown','error')),
  result jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kind, value_hash)
);
alter table public.contact_validation_cache enable row level security;
revoke all on table public.contact_validation_cache from anon, authenticated, public;
grant select, insert, update, delete on table public.contact_validation_cache to service_role;
