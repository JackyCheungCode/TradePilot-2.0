alter table public.record_activities
  drop constraint if exists record_activities_parent_activity_id_fkey;
alter table public.record_activity_attachments
  drop constraint if exists record_activity_attachments_activity_id_fkey;

create index if not exists record_activities_created_by_idx
  on public.record_activities(created_by) where created_by is not null;
create index if not exists record_activities_parent_owner_fk_idx
  on public.record_activities(parent_activity_id, owner_id) where parent_activity_id is not null;
create index if not exists record_activity_attachments_owner_fk_idx
  on public.record_activity_attachments(activity_id, owner_id);
create index if not exists record_activity_attachments_uploaded_by_idx
  on public.record_activity_attachments(uploaded_by) where uploaded_by is not null;
create index if not exists record_activity_tasks_assigned_to_idx
  on public.record_activity_tasks(assigned_to) where assigned_to is not null;
create index if not exists record_activity_tasks_completed_by_idx
  on public.record_activity_tasks(completed_by) where completed_by is not null;
create index if not exists record_activity_tasks_created_by_idx
  on public.record_activity_tasks(created_by) where created_by is not null;
create index if not exists record_audit_events_actor_id_idx
  on public.record_audit_events(actor_id) where actor_id is not null;
create index if not exists record_followers_user_id_idx
  on public.record_followers(user_id);
