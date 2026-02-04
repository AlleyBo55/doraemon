/**
 * Rate Limiter for Memory System
 * 
 * Prevents memory flooding and poisoning attacks.
 */

interface RateBucket {
  count: number;
  windowStart: number;
}

interface RateLimitConfig {
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
  burstLimit: number;
  burstWindowMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxPerMinute: 30,
  maxPerHour: 500,
  maxPerDay: 5000,
  burstLimit: 10,
  burstWindowMs: 1000,
};

const buckets = {
  minute: new Map<string, RateBucket>(),
  hour: new Map<string, RateBucket>(),
  day: new Map<string, RateBucket>(),
  burst: new Map<string, RateBucket>(),
};

let config = DEFAULT_CONFIG;

export function configureRateLimiter(newConfig: Partial<RateLimitConfig>): void {
  config = { ...DEFAULT_CONFIG, ...newConfig };
}

export function checkRateLimit(source: string): { allowed: boolean; reason?: string; retryAfterMs?: number } {
  const now = Date.now();
  const key = source || 'default';
  
  const burstResult = checkBucket(key, 'burst', config.burstLimit, config.burstWindowMs, now);
  if (!burstResult.allowed) {
    return { allowed: false, reason: 'Burst limit exceeded', retryAfterMs: burstResult.retryAfterMs };
  }
  
  const minuteResult = checkBucket(key, 'minute', config.maxPerMinute, 60_000, now);
  if (!minuteResult.allowed) {
    return { allowed: false, reason: 'Per-minute limit exceeded', retryAfterMs: minuteResult.retryAfterMs };
  }
  
  const hourResult = checkBucket(key, 'hour', config.maxPerHour, 3600_000, now);
  if (!hourResult.allowed) {
    return { allowed: false, reason: 'Per-hour limit exceeded', retryAfterMs: hourResult.retryAfterMs };
  }
  
  const dayResult = checkBucket(key, 'day', config.maxPerDay, 86400_000, now);
  if (!dayResult.allowed) {
    return { allowed: false, reason: 'Per-day limit exceeded', retryAfterMs: dayResult.retryAfterMs };
  }
  
  incrementBuckets(key, now);
  
  return { allowed: true };
}

function checkBucket(
  key: string,
  bucketType: keyof typeof buckets,
  limit: number,
  windowMs: number,
  now: number
): { allowed: boolean; retryAfterMs?: number } {
  const bucket = buckets[bucketType].get(key);
  
  if (!bucket || now - bucket.windowStart >= windowMs) {
    return { allowed: true };
  }
  
  if (bucket.count >= limit) {
    const retryAfterMs = windowMs - (now - bucket.windowStart);
    return { allowed: false, retryAfterMs };
  }
  
  return { allowed: true };
}

function incrementBuckets(key: string, now: number): void {
  const windows = [
    { type: 'burst' as const, ms: config.burstWindowMs },
    { type: 'minute' as const, ms: 60_000 },
    { type: 'hour' as const, ms: 3600_000 },
    { type: 'day' as const, ms: 86400_000 },
  ];
  
  for (const { type, ms } of windows) {
    const bucket = buckets[type].get(key);
    
    if (!bucket || now - bucket.windowStart >= ms) {
      buckets[type].set(key, { count: 1, windowStart: now });
    } else {
      bucket.count++;
    }
  }
}

export function getRateLimitStats(source: string): {
  minute: { used: number; limit: number };
  hour: { used: number; limit: number };
  day: { used: number; limit: number };
} {
  const key = source || 'default';
  const now = Date.now();
  
  const getUsed = (type: keyof typeof buckets, windowMs: number): number => {
    const bucket = buckets[type].get(key);
    if (!bucket || now - bucket.windowStart >= windowMs) return 0;
    return bucket.count;
  };
  
  return {
    minute: { used: getUsed('minute', 60_000), limit: config.maxPerMinute },
    hour: { used: getUsed('hour', 3600_000), limit: config.maxPerHour },
    day: { used: getUsed('day', 86400_000), limit: config.maxPerDay },
  };
}

export function resetRateLimits(source?: string): void {
  if (source) {
    for (const bucket of Object.values(buckets)) {
      bucket.delete(source);
    }
  } else {
    for (const bucket of Object.values(buckets)) {
      bucket.clear();
    }
  }
}
