-- Run with psql -v ON_ERROR_STOP=1 after all Supabase migrations.
do $$
declare
  v_bucket storage.buckets%rowtype;
  v_policy_count integer;
begin
  select * into v_bucket from storage.buckets where id='product-assets';
  if not found then
    raise exception 'product-assets bucket is missing';
  end if;
  if v_bucket.public or v_bucket.file_size_limit <> 15728640 then
    raise exception 'product-assets bucket privacy/size configuration is incorrect';
  end if;
  if not (v_bucket.allowed_mime_types @> array[
    'image/jpeg','image/png','image/webp','image/avif','application/pdf'
  ]::text[]) then
    raise exception 'product-assets MIME allowlist is incomplete';
  end if;

  select count(*) into v_policy_count from pg_policies
  where schemaname='storage' and tablename='objects'
    and policyname in (
      'product assets select own',
      'product assets insert own',
      'product assets update own',
      'product assets delete own'
    );
  if v_policy_count <> 4 then
    raise exception 'Expected four product-assets owner policies; got %', v_policy_count;
  end if;
end $$;
