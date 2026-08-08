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

export type DistributionPolicy = {
  open_beta_enabled: boolean;
  open_beta_batch_id: string | null;
  github_release_url: string | null;
};

export function shouldAutoGrant(
  policy: DistributionPolicy | null,
  batchStatus: string | null,
): boolean {
  return policy?.open_beta_enabled === true &&
    typeof policy.open_beta_batch_id === "string" &&
    batchStatus === "published";
}

export type DownloadChannel =
  | { channel: "github"; download_url: string }
  | { channel: "gated" };

export function resolveDownloadChannel(
  policy: DistributionPolicy | null,
  grantBatchId: string | null,
): DownloadChannel {
  if (
    policy?.open_beta_enabled === true &&
    typeof policy.github_release_url === "string" &&
    grantBatchId !== null &&
    grantBatchId === policy.open_beta_batch_id
  ) {
    return { channel: "github", download_url: policy.github_release_url };
  }
  return { channel: "gated" };
}

export type TermsState = "accepted" | "required" | "outdated" | "unavailable";

export function deriveTermsState(
  current: CurrentTerms | null,
  latestReceipt: TermsReceipt | null,
): TermsState {
  if (!current) return "unavailable";
  if (!latestReceipt) return "required";
  const matches = latestReceipt.document_id === current.document_id &&
    latestReceipt.document_version === current.version &&
    latestReceipt.document_sha256 === current.document_sha256;
  return matches ? "accepted" : "outdated";
}
