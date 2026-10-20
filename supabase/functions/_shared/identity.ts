export function isGoogleIdentity(
  user: { app_metadata?: { provider?: unknown; providers?: unknown } } | null,
): boolean {
  const providers = user?.app_metadata?.providers;
  return user?.app_metadata?.provider === "google" ||
    (Array.isArray(providers) && providers.includes("google"));
}
