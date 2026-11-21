
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('payment-documents','payment-documents',false,15728640,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public=false,file_size_limit=15728640,allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp'];

drop policy if exists payment_documents_select_own on storage.objects;
create policy payment_documents_select_own on storage.objects
for select to authenticated
using (bucket_id='payment-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists payment_documents_insert_own on storage.objects;
create policy payment_documents_insert_own on storage.objects
for insert to authenticated
with check (bucket_id='payment-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists payment_documents_update_own on storage.objects;
create policy payment_documents_update_own on storage.objects
for update to authenticated
using (bucket_id='payment-documents' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='payment-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists payment_documents_delete_own on storage.objects;
create policy payment_documents_delete_own on storage.objects
for delete to authenticated
using (bucket_id='payment-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
