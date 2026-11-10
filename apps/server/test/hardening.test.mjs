import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomInt, randomUUID } from 'node:crypto'
import { io } from 'socket.io-client'
import { loadConfig } from '../dist/config.js'
import { clientIp, ConnectionQuota, normalizeIp } from '../dist/network.js'
import { bearerAuthorized } from '../dist/observability.js'
import { WindowRateLimiter } from '../dist/guardrails.js'

const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const secret = 'metric-access-test-token-long-enough-123'

async function start(t, env = {}) {
  const port = randomInt(49001, 59000)
  const url = `http://127.0.0.1:${port}`
  const processHandle = spawn(process.execPath, ['apps/server/dist/index.js'], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port), ...env }, stdio: 'pipe',
  })
  t.after(() => processHandle.kill())
  for (let i = 0; i < 40; i++) {
    try { const response = await fetch(url + '/health'); if (response.ok) return { url, processHandle } }
    catch { /* server starting */ }
    await pause(75)
  }
  throw new Error('Server did not become ready')
}

async function connect(url, options = {}) {
  return await new Promise((resolve, reject) => {
    const socket = io(url, { forceNew: true, reconnection: false, transports: ['websocket'], timeout: 800, ...options })
    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', (error) => { socket.disconnect(); reject(error) })
  })
}
const ack = (socket, event, ...args) => socket.timeout(1500).emitWithAck(event, ...args)

test('Proxy addresses are trusted only from explicitly allowed direct peers', () => {
  const trusted = new Set(['127.0.0.1'])
  assert.equal(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1')
  assert.equal(clientIp('198.51.100.5', '203.0.113.3', trusted), '198.51.100.5')
  assert.equal(clientIp('::ffff:127.0.0.1', '203.0.113.2, 203.0.113.4', trusted), '203.0.113.4')
  assert.equal(clientIp('127.0.0.1', 'forged', trusted), '127.0.0.1')
  assert.equal(clientIp('127.0.0.1', ['203.0.113.6'], trusted), '127.0.0.1')
  assert.equal(clientIp('127.0.0.1', '203.0.113.1,'.repeat(30), trusted), '127.0.0.1')
})

test('Connection quotas release only once and do not keep inactive peers', () => {
  const quota = new ConnectionQuota(2, 1)
  assert.equal(quota.canConnect('a'), true)
  const releaseA = quota.opened('a')
  assert.equal(quota.canConnect('a'), false)
  assert.equal(quota.canConnect('b'), true)
  const releaseB = quota.opened('b')
  assert.equal(quota.canConnect('c'), false)
  releaseA()
  releaseA()
  assert.equal(quota.active, 1)
  assert.equal(quota.canConnect('a'), true)
  releaseB()
  assert.equal(quota.active, 0)
})

test('Rate limiter has a hard memory bound and fails closed on new keys', () => {
  const limiter = new WindowRateLimiter(2)
  assert.equal(limiter.allow('a', 2, 1000, 0), true)
  assert.equal(limiter.allow('b', 2, 1000, 0), true)
  assert.equal(limiter.allow('c', 2, 1000, 0), false)
  assert.equal(limiter.size, 2)
  limiter.sweep(1000)
  assert.equal(limiter.allow('c', 2, 1000, 1000), true)
  assert.equal(limiter.size, 1)
})

test('Configuration validates port, limits, origins and proxy trust before server start', () => {
  const before = { ...process.env }
  try {
    process.env.MAX_CONNECTIONS = 'NaN'
    assert.throws(() => loadConfig(), /MAX_CONNECTIONS/)
    delete process.env.MAX_CONNECTIONS
    process.env.CORS_ORIGINS = '*'
    assert.throws(() => loadConfig(), /CORS_ORIGINS/)
    process.env.CORS_ORIGINS = 'https://*.example.com'
    assert.throws(() => loadConfig(), /CORS_ORIGINS/)
    process.env.CORS_ORIGINS = 'http://localhost:5173'
    process.env.TRUSTED_PROXY_IPS = '0.0.0.0/0'
    assert.throws(() => loadConfig(), /TRUSTED_PROXY_IPS/)
    delete process.env.TRUSTED_PROXY_IPS
    process.env.TRUSTED_PROXY_IPS = '127.0.0.1'
    process.env.HOST = '0.0.0.0'
    assert.throws(() => loadConfig(), /HOST must bind/)
    delete process.env.TRUSTED_PROXY_IPS
    delete process.env.HOST
    process.env.METRICS_TOKEN = 'abc'
    assert.throws(() => loadConfig(), /METRICS_TOKEN/)
    delete process.env.METRICS_TOKEN
    process.env.REQUIRE_ORIGIN = 'yes'
    assert.throws(() => loadConfig(), /REQUIRE_ORIGIN/)
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in before)) delete process.env[k]
    for (const [k, v] of Object.entries(before)) process.env[k] = v
  }
  assert.equal(bearerAuthorized('Bearer ' + secret, secret), true)
  assert.equal(bearerAuthorized('Bearer x', secret), false)
})

test('Metrics endpoint requires a secret, and emits only aggregate values', async (t) => {
  const { url } = await start(t, { METRICS_TOKEN: secret })
  assert.equal((await fetch(url + '/ready')).status, 200)
  assert.equal((await fetch(url + '/metrics')).status, 403)
  assert.equal((await fetch(url + '/metrics', { headers: { Authorization: 'Bearer wrong' } })).status, 403)
  const client = await connect(url)
  t.after(() => client.disconnect())
  const room = await ack(client, 'room:create', 'french', 'Alice')
  assert.equal(room.ok, true)
  const response = await fetch(url + '/metrics', { headers: { Authorization: `Bearer ${secret}` } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const metrics = await response.json()
  assert.equal(metrics.gauges.rooms, 1)
  assert.equal(metrics.gauges.onlinePlayers, 1)
  assert.equal(metrics.gauges.connections, 1)
  assert.equal(metrics.counters.roomsCreated, 1)
  const text = JSON.stringify(metrics)
  assert.equal(text.includes(room.resumeToken), false)
  assert.equal(text.includes(room.roomId), false)
  assert.equal(text.includes('Alice'), false)
  assert.equal((await fetch(url + '/health')).status, 200)
})

test('Metrics stay unavailable if access token is not configured', async (t) => {
  const { url } = await start(t, { METRICS_TOKEN: '' })
  assert.equal((await fetch(url + '/metrics')).status, 404)
})

test('Simultaneous transport connection quota blocks peers and permits reconnect after release', async (t) => {
  const { url } = await start(t, { MAX_CONNECTIONS: '2', MAX_CONNECTIONS_PER_IP: '2' })
  const a = await connect(url)
  t.after(() => a.disconnect())
  const b = await connect(url)
  t.after(() => b.disconnect())
  await assert.rejects(() => connect(url))
  b.disconnect()
  await pause(120)
  const c = await connect(url)
  t.after(() => c.disconnect())
  assert.equal(c.connected, true)
})

test('Trusted proxy forwarding uses the nearest address for per-IP connection limits', async (t) => {
  const { url } = await start(t, {
    HOST: '127.0.0.1', TRUSTED_PROXY_IPS: '127.0.0.1', MAX_CONNECTIONS_PER_IP: '1', CONNECTION_ATTEMPTS_PER_MINUTE: '3',
  })
  const a = await connect(url, { extraHeaders: { 'X-Forwarded-For': '192.0.2.5' } })
  t.after(() => a.disconnect())
  await assert.rejects(() => connect(url, { extraHeaders: { 'X-Forwarded-For': '192.0.2.5' } }))
  const b = await connect(url, { extraHeaders: { 'X-Forwarded-For': '192.0.2.6' } })
  t.after(() => b.disconnect())
  assert.equal(b.connected, true)
})

test('Unknown events are bounded and malformed actions never change the room', async (t) => {
  const { url } = await start(t)
  const a = await connect(url)
  t.after(() => a.disconnect())
  const created = await ack(a, 'room:create', 'french', 'Alice')
  assert.equal(created.ok, true)
  for (const action of [null, [], { type: 'draw-table', actionId: randomUUID(), landingPosition: { x: Infinity, y: 0 } },
    { type: 'hand-to-table', cardId: 'private-other', position: { x: 0.5, y: 0.5 }, actionId: randomUUID() },
    { type: 'draw-hand', actionId: 'invalid-id' }]) {
    const result = await ack(a, 'table:action', action)
    assert.equal(result.ok, false)
  }
  assert.equal((await ack(a, 'table:action', { type: 'draw-hand', actionId: randomUUID() })).ok, true)
  for (let i = 0; i < 125; i++) {
    if (!a.connected) break
    a.emit('unknown:event', { ping: i })
  }
  await pause(150)
  assert.equal(a.connected, false)
})

test('Optional Origin requirement rejects originless Socket.IO clients and accepts configured origin', async (t) => {
  const { url } = await start(t, { REQUIRE_ORIGIN: 'true', CORS_ORIGINS: 'http://localhost:5173' })
  await assert.rejects(() => connect(url))
  await assert.rejects(() => connect(url, { extraHeaders: { Origin: 'https://bad.example' } }))
  const browser = await connect(url, { extraHeaders: { Origin: 'http://localhost:5173' } })
  t.after(() => browser.disconnect())
  assert.equal(browser.connected, true)
})

test('SIGTERM closes the server cleanly instead of leaving active Socket.IO sessions', {
  skip: process.platform === 'win32' ? 'Windows does not deliver POSIX SIGTERM handlers identically' : false,
}, async (t) => {
  const { url, processHandle } = await start(t)
  const client = await connect(url)
  t.after(() => client.disconnect())
  const stopped = new Promise((resolve) => processHandle.once('exit', (code, signal) => resolve({ code, signal })))
  processHandle.kill('SIGTERM')
  const result = await Promise.race([stopped, pause(3000).then(() => { throw new Error('Server shutdown timed out') })])
  assert.equal(result.code, 0)
  assert.equal(result.signal, null)
})
