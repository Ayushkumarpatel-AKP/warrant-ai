// Fixed-window in-memory rate limiter.
//
// Two hard requirements shape this file:
//  1. It is imported by middleware.ts, which runs on the Edge runtime. So NO
//     node:crypto, no node:fs, no Node built-ins anywhere in this module — only
//     web-standard types (Request/Map).
//  2. It is an in-process Map, so it MUST NOT grow without bound. Two defenses:
//     `prune()` sweeps expired buckets on a timer/interval basis, and
//     `MAX_KEYS` hard-caps distinct keys; when the cap is hit the oldest bucket
//     is evicted rather than the request being rejected.
//
// The store is per-instance, so it is correct for a single process and a
// best-effort bound behind a multi-instance deploy. It never logs a raw key.

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
};

// Hard ceiling on distinct tracked keys. At ~64 bytes of bookkeeping per entry
// this bounds the store at a few MB even under a flood of unique client keys.
const MAX_KEYS = 10_000;

// Sweep at most this often; cheap enough to run inline on each request.
const PRUNE_INTERVAL_MS = 30_000;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastPrune = 0;

/** Drop buckets whose window has closed, and enforce MAX_KEYS. */
function prune(now: number): void {
  if (now - lastPrune < PRUNE_INTERVAL_MS && buckets.size < MAX_KEYS) return;
  lastPrune = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Still oversized (a flood of unique keys inside one window): evict oldest.
  while (buckets.size > MAX_KEYS) {
    const oldest = buckets.keys().next();
    if (oldest.done) break;
    buckets.delete(oldest.value);
  }
}

/**
 * Consume one unit from the bucket for `key` and report whether it is allowed.
 * Never throws for ordinary input; the caller is expected to fail open anyway.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  prune(now);

  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1;
  const safeWindow = Number.isFinite(windowMs) && windowMs > 0 ? Math.floor(windowMs) : 60_000;

  const existing = buckets.get(key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + safeWindow };

  if (bucket.count >= safeLimit) {
    // Over budget: do NOT increment, so the window does not extend under abuse.
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    buckets.set(key, bucket);
    return { ok: false, remaining: 0, retryAfterSec };
  }

  bucket.count += 1;
  buckets.set(key, bucket);
  return {
    ok: true,
    remaining: Math.max(0, safeLimit - bucket.count),
    retryAfterSec: Math.max(0, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

const FALLBACK_CLIENT = "unknown";

/**
 * Bucket identity for an incoming request: the first x-forwarded-for hop,
 * falling back to a constant. `scope` is folded into the key so each endpoint
 * keeps its own independent budget. Returns a composite string that is only
 * ever used as a Map key — it is never logged.
 */
export function clientKey(req: Request, scope: string): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  const ip = first && first.length > 0 ? first : FALLBACK_CLIENT;
  return `${scope}|${ip}`;
}
