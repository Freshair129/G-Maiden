export type CurrentTerms = {
  document_id: string;
  version: string;
  document_sha256: string;
  effective_at: string;
};

export type TermsReceipt = {
  document_id: string;
  document_version: string;
  document_sha256: string;
};

type EntitlementInput = {
  gid: string | null;
  currentTerms: CurrentTerms | null;
  receipt: TermsReceipt | null;
  activeGrant: boolean;
};

export type EntitlementDecision =
  | { state: "account_not_eligible" }
  | { state: "terms_required"; gid: string; terms: CurrentTerms | null }
  | { state: "no_active_entitlement"; gid: string; terms: CurrentTerms }
  | { state: "eligible"; gid: string; terms: CurrentTerms };

export function isGoogleIdentity(user: { app_metadata?: { provider?: unknown; providers?: unknown } } | null): boolean {
  const providers = user?.app_metadata?.providers;
  return user?.app_metadata?.provider === "google" || (Array.isArray(providers) && providers.includes("google"));
}

export function decideGmadEntitlement(input: EntitlementInput): EntitlementDecision {
  if (!input.gid) return { state: "account_not_eligible" };
  const terms = input.currentTerms;
  const receipt = input.receipt;
  if (!terms || !receipt || receipt.document_id !== terms.document_id ||
      receipt.document_version !== terms.version || receipt.document_sha256 !== terms.document_sha256) {
    return { state: "terms_required", gid: input.gid, terms };
  }
  if (!input.activeGrant) return { state: "no_active_entitlement", gid: input.gid, terms };
  return { state: "eligible", gid: input.gid, terms };
}
