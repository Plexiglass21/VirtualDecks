import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomInt, randomUUID } from 'node:crypto'
import { io } from 'socket.io-client'

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const ack = (client, event, ...args) => client.timeout(2500).emitWithAck(event, ...args)
const action = (client, data) => ack(client, 'table:action', { ...data, actionId: randomUUID() })
const connect = (url) => new Promise((resolve, reject) => {
  const socket = io(url, { forceNew: true, reconnection: false, timeout: 1200 })
  socket.once('connect', () => resolve(socket))
  socket.once('connect_error', reject)
})

async function startServer(t, env = {}) {
  const port = randomInt(39000, 49000)
  const url = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['apps/server/dist/index.js'], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port), ...env }, stdio: 'pipe',
  })
  t.after(() => child.kill())
  let socket
  let lastError
  for (let i = 0; i < 35; i++) {
    try { socket = await connect(url); break }
    catch (error) { lastError = error; await pause(75) }
  }
  if (!socket) throw lastError
  t.after(() => socket.disconnect())
  return { url, socket }
}

function player(view, id) { return view.players.find((p) => p.id === id) }

test('Disconnect preserves identity and hand; correct token resumes while fake token fails', async (t) => {
  const { url, socket: alice } = await startServer(t)
  const bob = await connect(url)
  t.after(() => bob.disconnect())
  const create = await ack(alice, 'room:create', 'french')
  const join = await ack(bob, 'room:join', create.roomId)
  assert.equal(create.ok, true)
  assert.equal(join.ok, true)
  assert.equal(player(join, create.playerId).isHost, true)
  assert.equal(player(join, join.playerId).online, true)
  assert.equal((await action(alice, { type: 'draw-hand' })).ok, true)
  const savedId = (await ack(alice, 'room:resume', { roomId: create.roomId })).ok
  assert.equal(savedId, false) // Cannot resume an already-bound socket.
  const before = await action(alice, { type: 'draw-hand' })
  assert.equal(before.ok, true)
  const status = new Promise((resolve) => {
    const listener = (players) => {
      if (players.some((p) => p.id === create.playerId && !p.online)) { bob.off('room:players', listener); resolve(players) }
    }
    bob.on('room:players', listener)
  })
  alice.disconnect()
  await status
  const invalid = await connect(url)
  t.after(() => invalid.disconnect())
  assert.equal((await ack(invalid, 'room:resume', { roomId: create.roomId, playerId: create.playerId, token: '0'.repeat(64) })).ok, false)
  const resume = await connect(url)
  t.after(() => resume.disconnect())
  const recovery = await ack(resume, 'room:resume', { roomId: create.roomId, playerId: create.playerId, token: create.resumeToken })
  assert.equal(recovery.ok, true)
  assert.equal(recovery.playerId, create.playerId)
  assert.equal(player(recovery, create.playerId).online, true)
  assert.equal(recovery.table.hands.find(h => h.playerId === create.playerId).cards.length, 2)
  assert.equal((await action(bob, { type: 'reset' })).ok, false)
  assert.equal((await action(resume, { type: 'reset' })).ok, true)
})

test('Idempotent actions, host transfer and revoked token on voluntary exit', async (t) => {
  const { url, socket: alice } = await startServer(t)
  const bob = await connect(url)
  t.after(() => bob.disconnect())
  const create = await ack(alice, 'room:create', 'italian')
  const join = await ack(bob, 'room:join', create.roomId)
  assert.equal(join.ok, true)
  const move = { type: 'draw-hand', actionId: randomUUID() }
  const first = await ack(alice, 'table:action', move)
  const repeated = await ack(alice, 'table:action', move)
  assert.deepEqual(repeated, first)
  assert.equal(first.ok, true)
  const result = await ack(alice, 'room:leave')
  assert.equal(result.ok, true)
  const fake = await connect(url)
  t.after(() => fake.disconnect())
  assert.equal((await ack(fake, 'room:resume', { roomId: create.roomId, playerId: create.playerId, token: create.resumeToken })).ok, false)
  // Former host's one drawn card goes back into the deck.
  const bobRecovered = await ack(bob, 'table:action', { type: 'reset', actionId: randomUUID() })
  assert.equal(bobRecovered.ok, true)
  const c = await ack(fake, 'room:join', create.roomId)
  assert.equal(c.ok, true)
  assert.equal(player(c, join.playerId).isHost, true)
  assert.equal((await ack(bob, 'room:leave')).ok, true)
  assert.equal((await ack(fake, 'room:leave')).ok, true)
  assert.equal((await ack(fake, 'room:join', create.roomId)).ok, false)
})

test('An entirely offline room expires and can no longer be resumed', async (t) => {
  const { url, socket } = await startServer(t, { ROOM_EMPTY_TTL_MS: '500', ROOM_CLEANUP_INTERVAL_MS: '100' })
  const created = await ack(socket, 'room:create', 'french')
  socket.disconnect()
  await pause(850)
  const reconnect = await connect(url)
  t.after(() => reconnect.disconnect())
  const response = await ack(reconnect, 'room:resume', { roomId: created.roomId, playerId: created.playerId, token: created.resumeToken })
  assert.equal(response.ok, false)
  assert.equal((await ack(reconnect, 'room:join', created.roomId)).ok, false)
})
