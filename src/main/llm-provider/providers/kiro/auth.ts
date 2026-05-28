import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

const DEFAULT_REGION = 'us-east-1';
const REFRESH_LEADTIME_MS = 60_000;
const REFRESH_TIMEOUT_MS = 15_000;

const CRED_PATH = path.join(os.homedir(), '.aws', 'sso', 'cache', 'kiro-auth-token.json');

export interface KiroCreds {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  profileArn?: string;
  region?: string;
  clientId?: string;
  clientSecret?: string;
}

export class KiroAuthMissing extends Error {
  constructor() {
    super('Kiro credential file not found');
    this.name = 'KiroAuthMissing';
  }
}

export class KiroAuthExpired extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KiroAuthExpired';
  }
}

export class KiroAuthNetwork extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KiroAuthNetwork';
  }
}

let cached: KiroCreds | null = null;
let inFlightRefresh: Promise<KiroCreds> | null = null;
let inFlightProfileLookup: Promise<string | null> | null = null;

async function readCredsFromDisk(): Promise<KiroCreds> {
  let raw: string;
  try {
    raw = await fs.readFile(CRED_PATH, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new KiroAuthMissing();
    }
    throw new KiroAuthNetwork(
      `failed to read kiro creds: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new KiroAuthNetwork(
      `kiro creds JSON invalid: ${err instanceof Error ? err.message : 'parse error'}`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new KiroAuthNetwork('kiro creds is not an object');
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj['accessToken'] !== 'string' || typeof obj['refreshToken'] !== 'string') {
    throw new KiroAuthNetwork('kiro creds missing accessToken or refreshToken');
  }
  return {
    accessToken: obj['accessToken'],
    refreshToken: obj['refreshToken'],
    expiresAt: typeof obj['expiresAt'] === 'string' ? obj['expiresAt'] : '1970-01-01T00:00:00Z',
    ...(typeof obj['profileArn'] === 'string' ? { profileArn: obj['profileArn'] } : {}),
    ...(typeof obj['region'] === 'string' ? { region: obj['region'] } : {}),
    ...(typeof obj['clientId'] === 'string' ? { clientId: obj['clientId'] } : {}),
    ...(typeof obj['clientSecret'] === 'string' ? { clientSecret: obj['clientSecret'] } : {}),
  };
}

async function writeCredsToDisk(creds: KiroCreds): Promise<void> {
  const dir = path.dirname(CRED_PATH);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${CRED_PATH}.doraemon-tmp-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(creds, null, 2), { mode: 0o600 });
  await fs.rename(tmp, CRED_PATH);
}

function expiresAtMs(creds: KiroCreds): number {
  const t = Date.parse(creds.expiresAt);
  return Number.isFinite(t) ? t : 0;
}

function isExpired(creds: KiroCreds): boolean {
  return Date.now() + REFRESH_LEADTIME_MS >= expiresAtMs(creds);
}

async function refreshKiroDesktop(creds: KiroCreds): Promise<KiroCreds> {
  const region = creds.region ?? DEFAULT_REGION;
  const url = `https://prod.${region}.auth.desktop.kiro.dev/refreshToken`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REFRESH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: creds.refreshToken }),
      signal: ctrl.signal,
    });
    if (res.status === 401 || res.status === 403) {
      throw new KiroAuthExpired(`refresh rejected (HTTP ${res.status})`);
    }
    if (!res.ok) {
      throw new KiroAuthNetwork(`refresh failed HTTP ${res.status}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data['accessToken'] !== 'string' || typeof data['refreshToken'] !== 'string') {
      throw new KiroAuthNetwork('refresh response missing tokens');
    }
    return {
      ...creds,
      accessToken: data['accessToken'],
      refreshToken: data['refreshToken'],
      expiresAt:
        typeof data['expiresAt'] === 'string' ? data['expiresAt'] : creds.expiresAt,
    };
  } catch (err) {
    if (err instanceof KiroAuthExpired || err instanceof KiroAuthNetwork) throw err;
    throw new KiroAuthNetwork(
      `refresh transport error: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function refreshAwsSso(creds: KiroCreds): Promise<KiroCreds> {
  const region = creds.region ?? DEFAULT_REGION;
  const url = `https://oidc.${region}.amazonaws.com/token`;
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: creds.clientId ?? '',
    client_secret: creds.clientSecret ?? '',
    refresh_token: creds.refreshToken,
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REFRESH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: ctrl.signal,
    });
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new KiroAuthExpired(`SSO refresh rejected (HTTP ${res.status})`);
    }
    if (!res.ok) {
      throw new KiroAuthNetwork(`SSO refresh failed HTTP ${res.status}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data['accessToken'] !== 'string' && typeof data['access_token'] !== 'string') {
      throw new KiroAuthNetwork('SSO refresh response missing access token');
    }
    const accessToken =
      (data['accessToken'] as string | undefined) ?? (data['access_token'] as string);
    const refreshToken =
      (data['refreshToken'] as string | undefined) ??
      (data['refresh_token'] as string | undefined) ??
      creds.refreshToken;
    const expiresIn = Number(data['expiresIn'] ?? data['expires_in'] ?? 3600);
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    return { ...creds, accessToken, refreshToken, expiresAt };
  } catch (err) {
    if (err instanceof KiroAuthExpired || err instanceof KiroAuthNetwork) throw err;
    throw new KiroAuthNetwork(
      `SSO refresh transport error: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function performRefresh(creds: KiroCreds): Promise<KiroCreds> {
  const useSso = Boolean(creds.clientId && creds.clientSecret);
  const next = useSso ? await refreshAwsSso(creds) : await refreshKiroDesktop(creds);
  await writeCredsToDisk(next);
  return next;
}

export async function loadCreds(force = false): Promise<KiroCreds> {
  if (!force && cached) return cached;
  cached = await readCredsFromDisk();
  return cached;
}

export async function ensureFreshAccessToken(): Promise<{
  accessToken: string;
  region: string;
  profileArn: string | undefined;
}> {
  if (inFlightRefresh) {
    const refreshed = await inFlightRefresh;
    const profileArn = refreshed.profileArn ?? (await ensureProfileArn(refreshed));
    return {
      accessToken: refreshed.accessToken,
      region: refreshed.region ?? DEFAULT_REGION,
      profileArn,
    };
  }

  let creds = cached ?? (await loadCreds());
  if (!isExpired(creds)) {
    const profileArn = creds.profileArn ?? (await ensureProfileArn(creds));
    return {
      accessToken: creds.accessToken,
      region: creds.region ?? DEFAULT_REGION,
      profileArn,
    };
  }

  inFlightRefresh = (async () => {
    try {
      const next = await performRefresh(creds);
      cached = next;
      return next;
    } finally {
      inFlightRefresh = null;
    }
  })();

  const next = await inFlightRefresh;
  const profileArn = next.profileArn ?? (await ensureProfileArn(next));
  return {
    accessToken: next.accessToken,
    region: next.region ?? DEFAULT_REGION,
    profileArn,
  };
}

async function fetchProfileArn(creds: KiroCreds): Promise<string | null> {
  const region = creds.region ?? DEFAULT_REGION;
  const url = `https://codewhisperer.${region}.amazonaws.com/ListAvailableProfiles`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REFRESH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.accessToken}`,
        Accept: 'application/json',
      },
      body: JSON.stringify({}),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn(`[kiro-auth] ListAvailableProfiles HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as Record<string, unknown>;
    const profiles = data['profiles'];
    if (!Array.isArray(profiles) || profiles.length === 0) return null;
    const first = profiles[0] as Record<string, unknown>;
    const arn = first['arn'];
    return typeof arn === 'string' && arn.length > 0 ? arn : null;
  } catch (err) {
    console.warn(
      '[kiro-auth] ListAvailableProfiles failed:',
      err instanceof Error ? err.message : err,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureProfileArn(creds: KiroCreds): Promise<string | undefined> {
  if (creds.profileArn) return creds.profileArn;
  if (inFlightProfileLookup) {
    const arn = await inFlightProfileLookup;
    return arn ?? undefined;
  }
  inFlightProfileLookup = (async () => {
    try {
      const arn = await fetchProfileArn(creds);
      if (arn) {
        const updated: KiroCreds = { ...creds, profileArn: arn };
        cached = updated;
        // Persist so we don't have to re-fetch on every cold boot.
        try {
          await writeCredsToDisk(updated);
        } catch (err) {
          console.warn(
            '[kiro-auth] failed to persist profileArn:',
            err instanceof Error ? err.message : err,
          );
        }
      }
      return arn;
    } finally {
      inFlightProfileLookup = null;
    }
  })();
  const arn = await inFlightProfileLookup;
  return arn ?? undefined;
}

export function clearAuthCache(): void {
  cached = null;
  inFlightRefresh = null;
  inFlightProfileLookup = null;
}

export const __test__ = { CRED_PATH, isExpired, expiresAtMs };
