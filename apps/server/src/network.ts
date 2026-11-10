import { isIP } from 'node:net'

/** Socket.IO may normalize IPv4 peers as IPv4-mapped IPv6 addresses. */
export function normalizeIp(value: string | undefined): string {
  if (!value) return 'unknown'
  const address = value.startsWith('::ffff:') && isIP(value.slice(7)) === 4 ? value.slice(7) : value
  return isIP(address) ? address : 'unknown'
}

/**
 * Only trust the X-Forwarded-For chain if the IMMEDIATE TCP peer is listed as
 * trusted. Use the rightmost entry because it was appended by the last proxy,
 * not the attacker-controlled leftmost entries. Configure proxy to APPEND or
 * OVERWRITE incoming X-Forwarded-For; direct public access must be blocked.
 */
export function clientIp(
  peer: string | undefined,
  forwardedFor: string | string[] | undefined,
  trustedProxies: ReadonlySet<string>,
): string {
  const direct = normalizeIp(peer)
  if (!trustedProxies.has(direct)) return direct
  if (typeof forwardedFor !== 'string' || forwardedFor.length > 2048) return direct
  const entries = forwardedFor.split(',')
  if (!entries.length || entries.length > 16) return direct
  const nearest = normalizeIp(entries[entries.length - 1].trim())
  return nearest === 'unknown' ? direct : nearest
}

/** Track simultaneous underlying transport sessions (not just namespace sockets). */
export class ConnectionQuota {
  private readonly counts = new Map<string, number>()
  private total = 0
  constructor(private readonly maxTotal: number, private readonly maxPerIp: number) {}

  canConnect(ip: string): boolean {
    return this.total < this.maxTotal && (this.counts.get(ip) ?? 0) < this.maxPerIp
  }
  opened(ip: string): () => void {
    this.total++
    this.counts.set(ip, (this.counts.get(ip) ?? 0) + 1)
    let closed = false
    return () => {
      if (closed) return
      closed = true
      this.total--
      const previous = this.counts.get(ip) ?? 1
      if (previous <= 1) this.counts.delete(ip)
      else this.counts.set(ip, previous - 1)
    }
  }
  get active(): number { return this.total }
}
