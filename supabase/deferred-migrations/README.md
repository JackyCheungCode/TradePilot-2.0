# Deferred Supabase migrations

Files in this directory are intentionally excluded from the normal Supabase migration sequence.

## Inbox private attachments

`20261116233000_create_inbox_private_attachments.sql` is deferred until all of the following production gates pass:

- The private attachment bucket and owner-scoped object policies are verified.
- The ClamAV scanner service is deployed, authenticated, and health-checked.
- Upload, quarantine, scan, release, deletion, and download flows pass end-to-end tests.
- Retention, retry, and failed-scan handling are defined.

Do not move this migration into `supabase/migrations` or apply it to production until those gates pass.
