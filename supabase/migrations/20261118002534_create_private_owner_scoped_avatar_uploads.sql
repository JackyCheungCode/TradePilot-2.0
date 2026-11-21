-- User avatar storage. Public reads are intentional for the signed-in user's app-shell avatar;
-- all writes and object management are restricted to the owner's UUID folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "TradePilot users can upload their own avatar" on storage.objects;
create policy "TradePilot users can upload their own avatar" on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "TradePilot users can read their own avatar objects" on storage.objects;
create policy "TradePilot users can read their own avatar objects" on storage.objects for select to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "TradePilot users can update their own avatar" on storage.objects;
create policy "TradePilot users can update their own avatar" on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "TradePilot users can delete their own avatar" on storage.objects;
create policy "TradePilot users can delete their own avatar" on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
