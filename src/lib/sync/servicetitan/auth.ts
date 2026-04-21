/**
 * ServiceTitan OAuth 2.0 client-credentials flow.
 * Returns an access token; caches in module scope for the lifetime of the
 * server function (typically 5-15 min on Vercel serverless).
 */

const DEFAULT_AUTH_URL = 'https://auth.servicetitan.io/connect/token';

interface CachedToken {
  accessToken: string;
  expiresAt: number; // ms timestamp
}

let cached: CachedToken | null = null;

export interface StConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  appKey: string;
  authUrl: string;
  apiBase: string;
}

export function readStConfig(): StConfig {
  const tenantId = process.env.ST_TENANT_ID;
  const clientId = process.env.ST_CLIENT_ID;
  const clientSecret = process.env.ST_CLIENT_SECRET;
  const appKey = process.env.ST_APP_KEY;

  if (!tenantId || !clientId || !clientSecret || !appKey) {
    const missing = [
      !tenantId && 'ST_TENANT_ID',
      !clientId && 'ST_CLIENT_ID',
      !clientSecret && 'ST_CLIENT_SECRET',
      !appKey && 'ST_APP_KEY',
    ].filter(Boolean);
    throw new Error(`ServiceTitan config missing: ${missing.join(', ')}`);
  }

  return {
    tenantId,
    clientId,
    clientSecret,
    appKey,
    authUrl: process.env.ST_AUTH_URL ?? DEFAULT_AUTH_URL,
    apiBase: process.env.ST_API_URL ?? 'https://api.servicetitan.io',
  };
}

export async function getAccessToken(cfg: StConfig = readStConfig()): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt - 60_000 > now) {
    return cached.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });

  const res = await fetch(cfg.authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ST auth failed: ${res.status} ${res.statusText} ${text.slice(0, 400)}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in?: number };
  const expiresInMs = (json.expires_in ?? 900) * 1000;
  cached = {
    accessToken: json.access_token,
    expiresAt: now + expiresInMs,
  };
  return cached.accessToken;
}

/** Reset the cached token — useful after a 401 from the API. */
export function invalidateAccessToken(): void {
  cached = null;
}
