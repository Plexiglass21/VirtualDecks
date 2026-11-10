/** Explicit allow-list, shared by create and join. Names are not credentials. */
export function normalizeNickname(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)) return null
  const nickname = value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
  if ([...nickname].length < 2 || [...nickname].length > 20) return null
  // No control/bidi chars, HTML metacharacters, emoji or invisible chars.
  if (!/^[\p{L}\p{N}](?:[\p{L}\p{N} ._'-]*[\p{L}\p{N}])?$/u.test(nickname)) return null
  return nickname
}

/** Fixed-window limiter, bounded by the number of unique callers seen per window. */
export class WindowRateLimiter {
  private readonly buckets = new Map<string, { until: number; count: number }>()

  constructor(private readonly maxKeys = 10000) {
    if (!Number.isInteger(maxKeys) || maxKeys < 1) throw new Error('Invalid rate limiter capacity.')
  }

  get size(): number { return this.buckets.size }

  allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
    const prior = this.buckets.get(key)
    if (!prior || now >= prior.until) {
      // Fail closed if attacker-controlled keys would consume unbounded memory.
      if (!prior && this.buckets.size >= this.maxKeys) return false
      this.buckets.set(key, { until: now + windowMs, count: 1 })
      return true
    }
    if (prior.count >= limit) return false
    prior.count++
    return true
  }

  sweep(now = Date.now()): void {
    for (const [key, entry] of this.buckets) {
      if (now >= entry.until) this.buckets.delete(key)
    }
  }
}
