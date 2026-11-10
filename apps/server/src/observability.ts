import { createHash, timingSafeEqual } from 'node:crypto'
import type { AppConfig } from './config.js'

/** Aggregates only; never store card identities, nicknames, room codes, IPs or session tokens. */
export type MetricName =
  | 'handshakesRejected' | 'connectionsAccepted' | 'rateLimitsHit'
  | 'roomsCreated' | 'roomJoinSucceeded' | 'resumesSucceeded'
  | 'actionsAccepted' | 'actionsRejected' | 'serverErrors'

const names: MetricName[] = [
  'handshakesRejected', 'connectionsAccepted', 'rateLimitsHit',
  'roomsCreated', 'roomJoinSucceeded', 'resumesSucceeded',
  'actionsAccepted', 'actionsRejected', 'serverErrors',
]

export class Telemetry {
  private readonly startedAt = Date.now()
  private readonly counters = Object.fromEntries(names.map((key) => [key, 0])) as Record<MetricName, number>
  constructor(private readonly config: Pick<AppConfig, 'logLevel'>) {}

  increment(name: MetricName) { this.counters[name]++ }

  snapshot(gauges: { rooms: number; onlinePlayers: number; connections: number }) {
    return {
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      gauges, counters: { ...this.counters },
    }
  }

  log(level: 'error' | 'warn' | 'info' | 'debug', event: string, fields: Record<string, string | number | boolean> = {}) {
    const order = { error: 0, warn: 1, info: 2, debug: 3 }
    if (order[level] > order[this.config.logLevel]) return
    // No arbitrary error objects or untrusted values: caller supplies fixed event names and scalar counts.
    const row = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields })
    if (level === 'error') console.error(row)
    else console.log(row)
  }
}

/** Constant-time comparison for the optional, read-only telemetry endpoint. */
export function bearerAuthorized(header: string | undefined, token: string | undefined): boolean {
  if (!token || typeof header !== 'string' || !header.startsWith('Bearer ')) return false
  const provided = header.slice(7)
  // Compare hashes to avoid timing differences from token lengths.
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(token).digest()
  return timingSafeEqual(a, b)
}
