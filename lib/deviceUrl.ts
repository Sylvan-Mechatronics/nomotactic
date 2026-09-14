/**
 * Device URL validation.
 *
 * A confirmed device URL is persisted and every subsequent device API call —
 * carrying the bearer token — is sent to it. A poisoned or mistyped value must
 * therefore never be accepted (review finding S-15): only absolute `https://`
 * origins with no embedded credentials, path, query, or fragment are allowed.
 * The Soft AP bootstrap address is the single cleartext exception and is never
 * persisted through this path.
 */

/**
 * Normalise `raw` to an `https://host[:port]` origin, or return `null` when it
 * is not a safe device URL.
 */
export function normaliseDeviceUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  if (!url.hostname) return null;
  return url.origin;
}
