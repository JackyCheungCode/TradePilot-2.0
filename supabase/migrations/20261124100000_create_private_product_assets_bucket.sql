-- Recreate the private product asset bucket and owner-scoped object access
-- that existed in the source project but was not represented by a migration.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-assets',
  'product-assets',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','image/avif','application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product assets select own" on storage.objects;
create policy "product assets select own"
on storage.objects
for select to authenticated
using (
  bucket_id = 'product-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "product assets insert own" on storage.objects;
create policy "product assets insert own"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'product-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "product assets update own" on storage.objects;
create policy "product assets update own"
on storage.objects
for update to authenticated
using (
  bucket_id = 'product-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'product-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "product assets delete own" on storage.objects;
create policy "product assets delete own"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'product-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
