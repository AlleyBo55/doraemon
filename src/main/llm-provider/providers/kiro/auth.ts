import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { constants as fsc } from 'node:fs';

const DEFAULT_REGION = 'us-east-1';
// Two-tier expiry policy.
//   - SOON:    "good idea to refresh", but the token still works
//   - EXPIRED: "must refresh, the old token is dead"
// We refresh proactively at SOON, but if the refresh call fails we fall back
// to the still-valid access token until EXPIRED. This handles the case where
// Kiro IDE just rotated our refresh token: the old refresh is dead but the
// access token has minutes of life left, so a transient AWS 400 doesn't break
// the gateway.
const REFRESH_LEADTIME_SOON_MS = 5 * 60_000;
const REFRESH_LEADTIME_EXPIRED_MS = 5_000;
const REFRESH_TIMEOUT_MS = 15_000;
const LOCK_STALE_MS = 30_000;
const LOCK_POLL_INTERVAL_MS = 200;
const LOCK_TOTAL_WAIT_MS = 30_000;

const HOME = os.homedir();
const CRED_PATH = path.join(HOME, '.aws', 'sso', 'cache', 'kiro-auth-token.json');
const LOCK_PATH = `${CRED_PATH}.refresh-lock`;
// User-facing kill-switch: `touch ~/.aws/sso/cache/kiro-auth-token.json.no-refresh`
// to forbid the gateway from ever calling AWS to refresh.
const NO_REFRESH_FLAG = `${CRED_PATH}.no-refresh`;

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

function isExpiringSoon(creds: KiroCreds): boolean {
  return Date.now() + REFRESH_LEADTIME_SOON_MS >= expiresAtMs(creds);
}

function isHardExpired(creds: KiroCreds): boolean {
  return Date.now() + REFRESH_LEADTIME_EXPIRED_MS >= expiresAtMs(creds);
}

async function noRefreshGuard(): Promise<void> {
  try {
    await fs.access(NO_REFRESH_FLAG, fsc.F_OK);
    throw new KiroAuthExpired(
      `refresh blocked by ${NO_REFRESH_FLAG}. Remove the file to re-enable.`,
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
}

/**
 * Cross-process exclusive lock implemented via O_EXCL lockfile creation.
 * If a lockfile is older than LOCK_STALE_MS, treat it as orphaned and remove.
 */
async function acquireRefreshLock(): Promise<() => Promise<void>> {
  const start = Date.now();
  while (Date.now() - start < LOCK_TOTAL_WAIT_MS) {
    try {
      const handle = await fs.open(LOCK_PATH, 'wx', 0o600);
      const payload = JSON.stringify({ pid: process.pid, ts: Date.now() });
      await handle.writeFile(payload);
      await handle.close();
      return async () => {
        try {
          await fs.unlink(LOCK_PATH);
        } catch {
          // best-effort
        }
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw new KiroAuthNetwork(
          `failed to take refresh lock: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
      // Lock exists. If it's stale, kill it. Otherwise wait.
      try {
        const stat = await fs.stat(LOCK_PATH);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          console.warn('[kiro-auth] removing stale refresh lock');
          await fs.unlink(LOCK_PATH);
          continue;
        }
      } catch {
        // race: lock disappeared, retry immediately
        continue;
      }
      await new Promise((r) => setTimeout(r, LOCK_POLL_INTERVAL_MS));
    }
  }
  throw new KiroAuthNetwork('refresh lock timeout — another refresher is stuck');
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

/**
 * Holds the cross-process lock for the duration of a refresh attempt.
 * Critical sequence:
 *   1. Take the lockfile.
 *   2. Re-read disk (Kiro IDE may have just refreshed; that token is fresher).
 *   3. If disk token is now valid, return it without calling AWS.
 *   4. Otherwise call AWS and persist the result.
 *   5. Release the lock no matter what.
 */
/**
 * Refreshes the credentials with graceful degradation.
 *
 * Critical sequence:
 *   1. Take the cross-process lockfile.
 *   2. Re-read disk (Kiro IDE may have just refreshed; that token is fresher).
 *   3. If disk token is now valid, return it without calling AWS.
 *   4. Otherwise call AWS and persist the result.
 *   5. Release the lock no matter what.
 *
 * If the AWS call fails AND the existing access token is not yet hard-expired,
 * we return the existing creds and let the caller try the request anyway.
 * Throws KiroAuthExpired only when the token is truly dead.
 */
async function performRefresh(staleCreds: KiroCreds): Promise<KiroCreds> {
  await noRefreshGuard();
  const release = await acquireRefreshLock();
  try {
    let onDisk: KiroCreds;
    try {
      onDisk = await readCredsFromDisk();
    } catch {
      onDisk = staleCreds;
    }
    if (!isExpiringSoon(onDisk)) {
      return onDisk;
    }
    const useSso = Boolean(onDisk.clientId && onDisk.clientSecret);
    try {
      const next = useSso ? await refreshAwsSso(onDisk) : await refreshKiroDesktop(onDisk);
      await writeCredsToDisk(next);
      return next;
    } catch (err) {
      // AWS rejected our refresh. Most likely cause: the Kiro IDE refreshed
      // a millisecond before us, used our refresh token, and is in the middle
      // of writing the new pair to disk. The atomic rename is fast, but we
      // started this AWS call several seconds ago — give the disk a final
      // peek before declaring failure.
      try {
        const fresher = await readCredsFromDisk();
        if (
          fresher.refreshToken !== onDisk.refreshToken &&
          !isExpiringSoon(fresher)
        ) {
          const reason = err instanceof Error ? err.message : 'unknown';
          console.warn(
            `[kiro-auth] refresh rejected by AWS, but disk holds fresher creds from another writer (${reason}); using disk`,
          );
          return fresher;
        }
      } catch {
        // disk re-read failed; fall through to the access-token fallback below
      }

      // Last resort: if our access token still has time on its clock, return
      // it and let the caller try. The next request will re-read disk.
      if (!isHardExpired(onDisk)) {
        const reason = err instanceof Error ? err.message : 'unknown';
        console.warn(
          `[kiro-auth] refresh failed but access token still valid; degrading gracefully (${reason})`,
        );
        return onDisk;
      }
      throw err;
    }
  } finally {
    await release();
  }
}

export async function loadCreds(force = false): Promise<KiroCreds> {
  if (!force && cached) return cached;
  cached = await readCredsFromDisk();
  return cached;
}

/**
 * Returns a usable access token. Only refreshes when the on-disk token is
 * actually expiring soon. If a refresh fails but the access token is still
 * within its hard-expiry window, returns the existing token (graceful
 * degradation).
 */
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

  let creds: KiroCreds;
  try {
    creds = await readCredsFromDisk();
    cached = creds;
  } catch (err) {
    if (cached) {
      creds = cached;
    } else {
      throw err;
    }
  }

  if (!isExpiringSoon(creds)) {
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

/**
 * Called by the Kiro client when an upstream call returns 401. Re-reads disk
 * (Kiro IDE may have refreshed for us) and, if still expired, attempts a
 * single refresh. Falls back to the existing access token if refresh fails
 * but the token isn't hard-expired.
 */
export async function refreshOnUnauthorized(): Promise<string> {
  if (inFlightRefresh) {
    const r = await inFlightRefresh;
    return r.accessToken;
  }
  let onDisk: KiroCreds;
  try {
    onDisk = await readCredsFromDisk();
  } catch (err) {
    if (cached) {
      onDisk = cached;
    } else {
      throw err;
    }
  }
  cached = onDisk;
  if (!isExpiringSoon(onDisk)) {
    return onDisk.accessToken;
  }
  inFlightRefresh = (async () => {
    try {
      const next = await performRefresh(onDisk);
      cached = next;
      return next;
    } finally {
      inFlightRefresh = null;
    }
  })();
  const next = await inFlightRefresh;
  return next.accessToken;
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

export const __test__ = { CRED_PATH, LOCK_PATH, NO_REFRESH_FLAG, isExpiringSoon, isHardExpired, expiresAtMs };
