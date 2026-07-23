const MIN_OAUTH_STATE_LENGTH = 16;
const MAX_OAUTH_STATE_LENGTH = 4096;

export function oauthStateFromAuthorizationUrl(rawUrl: string): string | null {
  try {
    const state = new URL(rawUrl).searchParams.get("state");
    if (!state || state.length < MIN_OAUTH_STATE_LENGTH || state.length > MAX_OAUTH_STATE_LENGTH) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}
