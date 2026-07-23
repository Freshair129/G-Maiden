begin;

revoke all on table public.closed_beta_legal_documents, public.closed_beta_terms_receipts
  from service_role;
grant select on table public.closed_beta_legal_documents to service_role;
grant select, insert on table public.closed_beta_terms_receipts to service_role;

commit;
