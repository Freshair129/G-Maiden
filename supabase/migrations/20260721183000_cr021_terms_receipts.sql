begin;

create table public.closed_beta_legal_documents (
  document_id text not null,
  version text not null,
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  effective_at timestamptz not null,
  required_for_gmad boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (document_id, version)
);

create unique index closed_beta_required_terms_one_idx
  on public.closed_beta_legal_documents ((required_for_gmad))
  where required_for_gmad;

create table public.closed_beta_terms_receipts (
  id uuid primary key default gen_random_uuid(),
  -- Retain the pseudonymous Supabase subject for the approved three-year
  -- legal-receipt period even when the mutable profile/account row is removed.
  user_id uuid not null,
  document_id text not null,
  document_version text not null,
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  privacy_document_id text not null,
  privacy_document_version text not null,
  privacy_document_sha256 text not null check (privacy_document_sha256 ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz not null default now(),
  source text not null check (source in ('landing', 'desktop')),
  required_terms_accepted boolean not null,
  age_requirement_confirmed boolean not null,
  diagnostics_opt_in boolean not null default false,
  marketing_opt_in boolean not null default false,
  post_match_opt_in boolean not null default false,
  foreign key (document_id, document_version)
    references public.closed_beta_legal_documents(document_id, version),
  foreign key (privacy_document_id, privacy_document_version)
    references public.closed_beta_legal_documents(document_id, version),
  check (required_terms_accepted and age_requirement_confirmed)
);

create index closed_beta_terms_receipts_current_idx
  on public.closed_beta_terms_receipts (user_id, document_id, accepted_at desc);

alter table public.closed_beta_legal_documents enable row level security;
alter table public.closed_beta_terms_receipts enable row level security;
revoke all on table public.closed_beta_legal_documents, public.closed_beta_terms_receipts from public, anon, authenticated, service_role;
grant select on table public.closed_beta_legal_documents to service_role;
grant select, insert on table public.closed_beta_terms_receipts to service_role;

insert into public.closed_beta_legal_documents
  (document_id, version, document_sha256, effective_at, required_for_gmad)
values
  ('closed-beta-terms-of-use', '1.0.0-beta', '8a4829cc2cc2d79ef51b4efd20123918c5a32293c9b285b0c3a7317926d2d3b5', '2026-07-21T23:05:06+07:00', true),
  ('closed-beta-privacy-notice', '1.0.0-beta', 'd1cfa5d059f8e58bd08c4462bf1ba71f0216aa69ad22437a328c9ee9231587fa', '2026-07-21T23:05:06+07:00', false)
on conflict (document_id, version) do nothing;

commit;
