import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomInt, randomUUID } from 'node:crypto'
import { io } from 'socket.io-client'

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let nextTestNickname = 0
const ack = (client, event, ...args) => client.timeout(3000).emitWithAck(event, ...(
  event === 'room:create' ? [args[0], args[1] ?? 'Host'] :
  event === 'room:join' ? [args[0], args[1] ?? `Guest${++nextTestNickname}`] : args
))
const action = (client, type) => ack(client, 'table:action', { type, actionId: randomUUID() })
const connect = (url) => new Promise((resolve, reject) => {
  const socket = io(url, { forceNew: true, reconnection: false, timeout: 1000 })
  socket.once('connect', () => resolve(socket))
  socket.once('connect_error', reject)
})

async function startServer(t, overrides = {}) {
  const port = randomInt(49001, 59000)
  const url = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['apps/server/dist/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env, PORT: String(port),
      ROOM_CLEANUP_INTERVAL_MS: '100',
      HOST_OFFLINE_GRACE_MS: '250',
      OFFLINE_SEAT_TTL_MS: '1300',
      ...overrides,
    },
    stdio: 'pipe',
  })
  let errors = ''
  child.stderr.on('data', (data) => { errors += data.toString() })
  t.after(() => child.kill())
  let socket
  for (let i = 0; i < 40; i++) {
    try { socket = await connect(url); break }
    catch { await pause(75) }
  }
  if (!socket) throw new Error(`Could not start server: ${errors}`)
  t.after(() => socket.disconnect())
  return { url, socket }
}

function waitForPlayers(socket, predicate, maxMs = 3500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('room:players', listener)
      reject(new Error('Timed out waiting for room roster'))
    }, maxMs)
    function listener(players) {
      if (!predicate(players)) return
      clearTimeout(timer)
      socket.off('room:players', listener)
      resolve(players)
    }
    socket.on('room:players', listener)
  })
}

const findPlayer = (players, id) => players.find((player) => player.id === id)

test('Offline host transfers after grace period; returning host retains hand but not ownership', async (t) => {
  const { url, socket: alice } = await startServer(t)
  const bob = await connect(url)
  t.after(() => bob.disconnect())
  const room = await ack(alice, 'room:create', 'french')
  const guest = await ack(bob, 'room:join', room.roomId)
  assert.equal((await action(alice, 'draw-hand')).ok, true)
  const becameHost = waitForPlayers(bob, (players) => findPlayer(players, guest.playerId)?.isHost)
  alice.disconnect()
  assert.equal((await action(bob, 'reset')).ok, false, 'Guest cannot reset during grace period')
  const players = await becameHost
  const returning = await connect(url)
  t.after(() => returning.disconnect())
  const resumed = await ack(returning, 'room:resume', { roomId: room.roomId, playerId: room.playerId, token: room.resumeToken })
  assert.equal(resumed.ok, true)
  assert.equal(resumed.table.hands.find((hand) => hand.playerId === room.playerId).cards.length, 1, 'Private hand survives handover')
  assert.equal(findPlayer(players, room.playerId)?.isHost, false)
  assert.equal(findPlayer(players, guest.playerId)?.isHost, true)
  assert.equal(findPlayer(resumed.players, room.playerId).isHost, false)
  assert.equal((await action(bob, 'reset')).ok, true)
  assert.equal(findPlayer(resumed.players, guest.playerId).isHost, true)
  assert.equal((await action(returning, 'reset')).ok, false)
})

test('Reconnecting during grace keeps the original host and private hand intact', async (t) => {
  const { url, socket: alice } = await startServer(t, { HOST_OFFLINE_GRACE_MS: '1000' })
  const bob = await connect(url)
  t.after(() => bob.disconnect())
  const room = await ack(alice, 'room:create', 'italian')
  const guest = await ack(bob, 'room:join', room.roomId)
  assert.equal((await action(alice, 'draw-hand')).ok, true)
  alice.disconnect()
  await pause(160)
  const reconnect = await connect(url)
  t.after(() => reconnect.disconnect())
  const resumed = await ack(reconnect, 'room:resume', { roomId: room.roomId, playerId: room.playerId, token: room.resumeToken })
  assert.equal(resumed.ok, true)
  assert.equal(findPlayer(resumed.players, room.playerId).isHost, true)
  assert.equal(resumed.table.hands.find((hand) => hand.playerId === room.playerId).cards.length, 1)
  assert.equal((await action(bob, 'reset')).ok, false)
  assert.equal((await action(reconnect, 'reset')).ok, true)
  assert.equal(findPlayer(resumed.players, guest.playerId).online, true)
})

test('Offline seat expires while others play, revokes resume token and returns cards to deck', async (t) => {
  const { url, socket: alice } = await startServer(t, { OFFLINE_SEAT_TTL_MS: '450', HOST_OFFLINE_GRACE_MS: '250' })
  const bob = await connect(url)
  t.after(() => bob.disconnect())
  const room = await ack(alice, 'room:create', 'french')
  const guest = await ack(bob, 'room:join', room.roomId)
  assert.equal((await action(bob, 'draw-hand')).ok, true)
  const removed = waitForPlayers(alice, (players) => !findPlayer(players, guest.playerId))
  bob.disconnect()
  const players = await removed
  assert.equal(players.length, 1)
  const probe = await connect(url)
  t.after(() => probe.disconnect())
  const stale = await ack(probe, 'room:resume', { roomId: room.roomId, playerId: guest.playerId, token: guest.resumeToken })
  assert.equal(stale.ok, false)
  const replacement = await ack(probe, 'room:join', room.roomId)
  assert.equal(replacement.ok, true)
  assert.equal(replacement.table.deckCount, 52, 'Expired participant hand returned to deck')
  assert.equal(replacement.players.length, 2)
})

test('All-offline room stays resumable within empty-room TTL, even beyond offline seat TTL', async (t) => {
  const { url, socket: alice } = await startServer(t, {
    OFFLINE_SEAT_TTL_MS: '220', ROOM_EMPTY_TTL_MS: '1600', HOST_OFFLINE_GRACE_MS: '200',
  })
  const room = await ack(alice, 'room:create', 'french')
  assert.equal((await action(alice, 'draw-hand')).ok, true)
  alice.disconnect()
  await pause(510)
  const resumedSocket = await connect(url)
  t.after(() => resumedSocket.disconnect())
  const resumed = await ack(resumedSocket, 'room:resume', { roomId: room.roomId, playerId: room.playerId, token: room.resumeToken })
  assert.equal(resumed.ok, true)
  assert.equal(findPlayer(resumed.players, room.playerId).isHost, true)
  assert.equal(resumed.table.hands[0].cards.length, 1)
})

test('Host voluntarily leaving chooses an online player over an older offline seat', async (t) => {
  const { url, socket: alice } = await startServer(t, { HOST_OFFLINE_GRACE_MS: '1500' })
  const bob = await connect(url)
  const carol = await connect(url)
  t.after(() => { bob.disconnect(); carol.disconnect() })
  const room = await ack(alice, 'room:create', 'french')
  await ack(bob, 'room:join', room.roomId)
  const c = await ack(carol, 'room:join', room.roomId)
  bob.disconnect()
  assert.equal((await ack(alice, 'room:leave')).ok, true)
  const roster = await ack(carol, 'table:action', { type: 'reset', actionId: randomUUID() })
  assert.equal(roster.ok, true)
  const fresh = await connect(url)
  t.after(() => fresh.disconnect())
  const joined = await ack(fresh, 'room:join', room.roomId)
  assert.equal(findPlayer(joined.players, c.playerId).isHost, true)
})

test('Empty room cannot be revived after TTL just because cleanup sweep has not run yet', async (t) => {
  const { url, socket: alice } = await startServer(t, {
    ROOM_EMPTY_TTL_MS: '500', ROOM_CLEANUP_INTERVAL_MS: '2000',
  })
  const room = await ack(alice, 'room:create', 'italian')
  alice.disconnect()
  await pause(690)
  const probe = await connect(url)
  t.after(() => probe.disconnect())
  assert.equal((await ack(probe, 'room:join', room.roomId)).ok, false)
  assert.equal((await ack(probe, 'room:resume', { roomId: room.roomId, playerId: room.playerId, token: room.resumeToken })).ok, false)
})

test('A room with eight seats admits a replacement after stale offline seats are cleaned', async (t) => {
  const { url, socket: host } = await startServer(t, { OFFLINE_SEAT_TTL_MS: '450' })
  const room = await ack(host, 'room:create', 'french')
  const disconnected = []
  for (let i = 0; i < 7; i++) {
    const guest = await connect(url)
    const joined = await ack(guest, 'room:join', room.roomId)
    assert.equal(joined.ok, true)
    disconnected.push(joined)
    guest.disconnect()
  }
  await pause(700)
  const replacement = await connect(url)
  t.after(() => replacement.disconnect())
  const joined = await ack(replacement, 'room:join', room.roomId)
  assert.equal(joined.ok, true)
  assert.equal(joined.players.length, 2, 'Only active host and fresh replacement should remain')
  for (const previous of disconnected) {
    assert.equal(findPlayer(joined.players, previous.playerId), undefined)
  }
})
