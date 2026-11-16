-- Archive generated trade document PDFs by immutable document version.
alter table public.trade_document_versions
  add column if not exists pdf_storage_path text,
  add column if not exists pdf_file_name text,
  add column if not exists pdf_content_type text,
  add column if not exists pdf_file_size bigint,
  add column if not exists pdf_sha256 text,
  add column if not exists pdf_generated_at timestamptz;

create index if not exists trade_document_versions_pdf_lookup_idx
  on public.trade_document_versions (owner_id, document_id, version_number)
  where pdf_storage_path is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trade-document-files', 'trade-document-files', false, 26214400, array['application/pdf']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

comment on column public.trade_document_versions.pdf_storage_path is
  'Private Supabase Storage path for the PDF rendered from this immutable document version.';
