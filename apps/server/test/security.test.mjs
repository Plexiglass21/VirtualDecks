import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomInt, randomUUID } from 'node:crypto'
import { io } from 'socket.io-client'

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const ack = (client, event, ...args) => client.timeout(3000).emitWithAck(event, ...args)
const connect = (url, options = {}) => new Promise((resolve, reject) => {
  const client = io(url, { forceNew: true, reconnection: false, timeout: 1200, ...options })
  client.once('connect', () => resolve(client))
  client.once('connect_error', (error) => { client.disconnect(); reject(error) })
})

async function start(t, env = {}) {
  const port = randomInt(29000, 30999)
  const url = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, ['apps/server/dist/index.js'], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port), ...env }, stdio: 'pipe',
  })
  t.after(() => server.kill())
  let client
  let problem
  for (let i = 0; i < 35; i++) {
    try { client = await connect(url); break }
    catch (error) { problem = error; await pause(75) }
  }
  if (!client) throw problem
  t.after(() => client.disconnect())
  return { url, client }
}

test('Nickname is mandatory, unique per room, sanitized and preserved on resume', async t => {
  const { url, client: a } = await start(t)
  const b = await connect(url)
  const c = await connect(url)
  t.after(() => { b.disconnect(); c.disconnect() })

  assert.equal((await ack(a, 'room:create', 'french', null)).ok, false)
  assert.equal((await ack(a, 'room:create', 'french', '<b>')).ok, false)
  const room = await ack(a, 'room:create', 'french', '  Maria  Rossi ')
  assert.equal(room.ok, true)
  assert.equal(room.players[0].name, 'Maria Rossi')

  const duplicate = await ack(b, 'room:join', room.roomId, 'maria rossi')
  assert.equal(duplicate.ok, false)
  assert.match(duplicate.error, /already used/i)
  assert.equal((await ack(b, 'room:join', room.roomId, '💣')).ok, false)
  const guest = await ack(b, 'room:join', room.roomId, 'Giulia')
  assert.equal(guest.ok, true)
  assert.equal(guest.players.find(p => p.id === guest.playerId).name, 'Giulia')

  b.disconnect()
  const resume = await ack(c, 'room:resume', { roomId: room.roomId, playerId: guest.playerId, token: guest.resumeToken })
  assert.equal(resume.ok, true)
  assert.equal(resume.players.find(p => p.id === guest.playerId).name, 'Giulia')
})

test('Creation capacity, health endpoint, and Origin restrictions', async t => {
  const { url, client: a } = await start(t, { MAX_ROOMS: '1', CORS_ORIGINS: 'http://localhost:5173' })
  const health = await fetch(`${url}/health`)
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { ok: true })
  assert.equal((await fetch(`${url}/not-found`)).status, 404)
  const room = await ack(a, 'room:create', 'french', 'HostName')
  assert.equal(room.ok, true)
  const b = await connect(url)
  t.after(() => b.disconnect())
  const full = await ack(b, 'room:create', 'italian', 'SecondHost')
  assert.equal(full.ok, false)
  assert.match(full.error, /capacity/i)
  await assert.rejects(() => connect(url, { extraHeaders: { Origin: 'https://untrusted.example' } }))
})

test('IP limits room code guessing and socket limits repeated gameplay actions', async t => {
  const { url, client: host } = await start(t)
  const bad = await connect(url)
  t.after(() => bad.disconnect())
  const room = await ack(host, 'room:create', 'french', 'HostName')
  assert.equal(room.ok, true)
  for (let i = 0; i < 40; i++) {
    assert.equal((await ack(bad, 'room:join', 'AAAA', 'Attacker')).ok, false)
  }
  const throttled = await ack(bad, 'room:join', room.roomId, 'Legitimate')
  assert.equal(throttled.ok, false)
  assert.match(throttled.error, /too many/i)
  const action = { type: 'not-supported', actionId: '00000000-0000-4000-8000-000000000001' }
  for (let i = 0; i < 60; i++) {
    const result = await ack(host, 'table:action', action)
    assert.equal(result.ok, false)
  }
  const flooded = await ack(host, 'table:action', action)
  assert.equal(flooded.ok, false)
  assert.match(flooded.error, /too many actions/i)
})


test('Moving a table card into a completely empty private hand is supported', async t => {
  const { client } = await start(t)
  const room = await ack(client, 'room:create', 'french', 'Alice')
  assert.equal(room.ok, true)
  assert.equal(room.table.hands.find(h => h.playerId === room.playerId).cards.length, 0)

  const waitForVersion = (minVersion) => new Promise(resolve => {
    function onState(state) {
      if (state.version >= minVersion) {
        client.off('table:state', onState)
        resolve(state)
      }
    }
    client.on('table:state', onState)
  })
  const afterDraw = waitForVersion(room.table.version + 1)
  assert.equal((await ack(client, 'table:action', {
    type: 'draw-table', landingPosition: { x: 0.5, y: 0.5 }, actionId: randomUUID(),
  })).ok, true)
  const table = await afterDraw
  assert.equal(table.looseCards.length, 1)

  const afterPickup = waitForVersion(table.version + 1)
  assert.equal((await ack(client, 'table:action', {
    type: 'table-to-hand', cardIds: [table.looseCards[0].id], actionId: randomUUID(),
  })).ok, true)
  const updated = await afterPickup
  assert.equal(updated.looseCards.length, 0)
  assert.equal(updated.hands.find(h => h.playerId === room.playerId).cards.length, 1)
})
