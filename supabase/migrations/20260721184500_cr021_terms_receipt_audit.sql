begin;

alter table public.gmad_download_audit
  drop constraint gmad_download_audit_action_check;
alter table public.gmad_download_audit
  add constraint gmad_download_audit_action_check check (action in (
    'batch_created', 'batch_published', 'batch_status_changed', 'queue_checked',
    'download_issued', 'role_changed', 'owner_bootstrapped',
    'terms_accepted', 'desktop_entitlement_checked'
  ));

commit;
