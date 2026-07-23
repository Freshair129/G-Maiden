-- CR-019: application owner role. Bootstrap identity is intentionally not stored in source.
begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('user', 'creator', 'admin', 'owner'));

alter table public.gmad_download_audit drop constraint if exists gmad_download_audit_action_check;
alter table public.gmad_download_audit add constraint gmad_download_audit_action_check
  check (action in ('batch_created', 'batch_published', 'batch_status_changed', 'queue_checked', 'download_issued', 'role_changed', 'owner_bootstrapped'));

commit;
