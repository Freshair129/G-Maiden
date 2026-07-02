export function apiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    const isDevHost = host === "localhost" || host === "127.0.0.1";
    if (protocol.startsWith("http") && isDevHost) return normalized;
  }

  return `http://127.0.0.1:4577${normalized}`;
}
