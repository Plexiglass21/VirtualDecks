/**
 * Generate the UUID v4 used to deduplicate Socket.IO game actions.
 *
 * crypto.randomUUID() is only exposed in secure browser contexts. During
 * local-network testing, a phone typically opens http://192.168.x.x:5173:
 * crypto.randomUUID() is undefined there, even though getRandomValues() works.
 * This fallback is intentionally cryptographically random and keeps the UUID
 * format accepted by the server's actionId validator.
 */
export function createActionId(provider: Crypto = globalThis.crypto): string {
  if (typeof provider.randomUUID === 'function') {
    return provider.randomUUID()
  }

  // Unlike randomUUID(), getRandomValues() is also available over HTTP LAN.
  const bytes = provider.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // UUID v4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
