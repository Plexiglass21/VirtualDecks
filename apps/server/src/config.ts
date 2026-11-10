import { isIP } from 'node:net'

function integerEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) throw new Error(`Invalid ${name}: expected an integer between ${min} and ${max}.`)
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid ${name}: expected an integer between ${min} and ${max}.`)
  }
  return parsed
}

function originsEnv(): string[] {
  const raw = process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173'
  const origins = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (!origins.length) throw new Error('CORS_ORIGINS must contain at least one explicit origin.')
  for (const origin of origins) {
    let parsed: URL
    try { parsed = new URL(origin) }
    catch { throw new Error('CORS_ORIGINS must contain only valid HTTP(S) origins.') }
    if (!['http:', 'https:'].includes(parsed.protocol) || origin.includes('*') || parsed.origin !== origin || parsed.username || parsed.password) {
      throw new Error('CORS_ORIGINS must contain only exact HTTP(S) origins, without paths or wildcards.')
    }
  }
  return [...new Set(origins)]
}

function trustedProxyIpsEnv(): ReadonlySet<string> {
  const raw = process.env.TRUSTED_PROXY_IPS ?? ''
  const proxies = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (proxies.some((ip) => !isIP(ip))) {
    throw new Error('TRUSTED_PROXY_IPS must contain literal IP addresses, not hostnames or CIDR ranges.')
  }
  return new Set(proxies.map((ip) => ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip))
}

function metricsTokenEnv(): string | undefined {
  const token = process.env.METRICS_TOKEN
  if (!token) return undefined
  if (token.length < 24 || token.length > 256 || !/^[\x21-\x7e]+$/.test(token)) {
    throw new Error('METRICS_TOKEN must be 24–256 printable ASCII characters without spaces.')
  }
  return token
}

export function loadConfig() {
  if (process.env.REQUIRE_ORIGIN && !['true', 'false'].includes(process.env.REQUIRE_ORIGIN)) {
    throw new Error('REQUIRE_ORIGIN must be true or false.')
  }
  const host = process.env.HOST || '0.0.0.0'
  if (!isIP(host)) throw new Error('HOST must be an explicit IPv4 or IPv6 address.')
  const trustedProxyIps = trustedProxyIpsEnv()
  if (trustedProxyIps.size && (host === '0.0.0.0' || host === '::')) {
    throw new Error('With TRUSTED_PROXY_IPS set, HOST must bind to a specific interface (preferably 127.0.0.1).')
  }
  const logLevel = process.env.LOG_LEVEL || 'info'
  if (!['error', 'warn', 'info', 'debug'].includes(logLevel)) {
    throw new Error('LOG_LEVEL must be error, warn, info, or debug.')
  }
  return {
    host,
    port: integerEnv('PORT', 3001, 1, 65535),
    allowedOrigins: originsEnv(),
    trustedProxyIps,
    metricsToken: metricsTokenEnv(),
    // Enable only if all clients (including monitoring clients) send an Origin.
    requireOrigin: process.env.REQUIRE_ORIGIN === 'true',
    logLevel: logLevel as 'error' | 'warn' | 'info' | 'debug',
    maxRooms: integerEnv('MAX_ROOMS', 200, 1, 5000),
    maxConnections: integerEnv('MAX_CONNECTIONS', 256, 1, 5000),
    maxConnectionsPerIp: integerEnv('MAX_CONNECTIONS_PER_IP', 32, 1, 256),
    connectionAttemptsPerMinute: integerEnv('CONNECTION_ATTEMPTS_PER_MINUTE', 60, 1, 1000),
    maxRateLimiterKeys: integerEnv('MAX_RATE_LIMITER_KEYS', 10000, 100, 1000000),
    maxPacketBytes: integerEnv('MAX_PACKET_BYTES', 16384, 1024, 65536),
    roomEmptyTtlMs: integerEnv('ROOM_EMPTY_TTL_MS', 3600000, 500, 86400000),
    cleanupIntervalMs: integerEnv('ROOM_CLEANUP_INTERVAL_MS', 60000, 100, 3600000),
    hostOfflineGraceMs: integerEnv('HOST_OFFLINE_GRACE_MS', 180000, 100, 3600000),
    offlineSeatTtlMs: integerEnv('OFFLINE_SEAT_TTL_MS', 1200000, 100, 86400000),
    shutdownTimeoutMs: integerEnv('SHUTDOWN_TIMEOUT_MS', 8000, 100, 30000),
  }
}

export type AppConfig = ReturnType<typeof loadConfig>
