/**
 * Simple in-memory rate limiter for AI endpoints.
 * Uses a sliding window per key (IP or user email).
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 300_000);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 300_000);

/**
 * Check if a request is rate-limited.
 * Returns { limited: false } if allowed, or { limited: true } if blocked.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { limited: boolean; retryAfterMs?: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter(
    (t) => now - t < config.windowMs
  );

  if (entry.timestamps.length >= config.maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = config.windowMs - (now - oldestInWindow);
    return { limited: true, retryAfterMs };
  }

  entry.timestamps.push(now);
  return { limited: false };
}

/**
 * Pre-configured rate limit configs for AI endpoints.
 */
export const AI_RATE_LIMITS = {
  messageGenerate: { maxRequests: 10, windowMs: 60_000 },
  insightGenerate: { maxRequests: 5, windowMs: 60_000 },
  tipSuggest: { maxRequests: 5, windowMs: 60_000 },
  knowledgeExtract: { maxRequests: 5, windowMs: 60_000 },
  knowledgeDiscover: { maxRequests: 5, windowMs: 60_000 },
  patternSuggest: { maxRequests: 10, windowMs: 60_000 },
} as const;

/**
 * Helper: extract a rate-limit key from the user email.
 */
export function rateLimitKey(endpoint: string, email: string): string {
  return `${endpoint}:${email}`;
}
