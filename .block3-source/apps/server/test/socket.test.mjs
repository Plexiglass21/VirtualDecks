import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomInt, randomUUID } from 'node:crypto'
import { io } from 'socket.io-client'

const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const connect = (url) => new Promise((resolve, reject) => {
  const client = io(url, { reconnection: false, timeout: 1000, forceNew: true })
  client.once('connect', () => resolve(client))
  client.once('connect_error', reject)
})
const ack = (client, event, ...args) => client.timeout(1500).emitWithAck(event, ...(event === 'table:action' ? [{ ...args[0], actionId: randomUUID() }] : args))
const nextState = (client) => new Promise((resolve) => client.once('table:state', resolve))
const stateAtLeast = (client, version) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { client.off('table:state', onState); reject(new Error(`Timed out waiting for state version ${version}`)) }, 1500)
  function onState(state) {
    if (state.version >= version) {
      clearTimeout(timer)
      client.off('table:state', onState)
      resolve(state)
    }
  }
  client.on('table:state', onState)
})

test('Two real Socket.IO clients: room and draw synchronized, hands kept private', async (t) => {
  const port = randomInt(31000, 39000)
  const url = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, ['apps/server/dist/index.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: 'pipe' })
  t.after(() => server.kill())
  let a, b, outsider
  t.after(() => { a?.disconnect(); b?.disconnect(); outsider?.disconnect() })
  let lastError
  for (let attempt = 0; attempt < 30; attempt++) {
    try { a = await connect(url); break }
    catch (error) { lastError = error; await pause(75) }
  }
  if (!a) throw lastError
  b = await connect(url)
  outsider = await connect(url)
  const room = await ack(a, 'room:create', 'french')
  assert.equal(room.ok, true)
  assert.equal(room.table.deckCount, 52)
  assert.equal(room.table.deck, undefined)
  const joined = await ack(b, 'room:join', room.roomId)
  assert.equal(joined.ok, true)
  assert.equal((await ack(outsider, 'table:action', { type: 'draw-hand' })).ok, false)

  const aNext = stateAtLeast(a, joined.table.version + 1)
  const bNext = stateAtLeast(b, joined.table.version + 1)
  assert.equal((await ack(a, 'table:action', { type: 'draw-hand' })).ok, true)
  const [aView, bView] = await Promise.all([aNext, bNext])
  assert.equal(aView.deckCount, 51)
  assert.equal(bView.deckCount, 51)
  assert.equal(aView.hands.length, 2)
  assert.equal(aView.hands.find(h => h.playerId === room.playerId).cards.length, 1)
  assert.equal(bView.hands.length, 2)
  assert.equal(bView.hands.find(h => h.playerId === room.playerId).cards.length, 1)
  assert.equal(bView.hands.find(h => h.playerId === room.playerId).cards[0].rank, undefined)
  assert.equal(JSON.stringify(bView).includes(aView.hands.find(h => h.playerId === room.playerId).cards[0].id), false)
  assert.equal((await ack(b, 'table:action', { type: 'hand-to-table', cardId: aView.hands.find(h => h.playerId === room.playerId).cards[0].id, position: { x: .5, y: .5 } })).ok, false)
  assert.equal((await ack(a, 'table:action', { type: 'hand-to-table', cardId: aView.hands.find(h => h.playerId === room.playerId).cards[0].id, position: { x: .5, y: .5 } })).ok, true)
  assert.equal((await ack(b, 'table:action', { type: 'flip-cards', cardIds: [aView.hands.find(h => h.playerId === room.playerId).cards[0].id] })).ok, true)
  const hidden = await nextStateAfterAction(b, ack(b, 'table:action', { type: 'move-cards', moves: [{ id: aView.hands.find(h => h.playerId === room.playerId).cards[0].id, position: { x: .4, y: .4 } }] }))
  assert.equal(hidden.looseCards[0].faceUp, false)
  assert.equal(hidden.looseCards[0].rank, undefined)
  assert.equal(hidden.looseCards[0].suit, undefined)
})

async function nextStateAfterAction(client, command) {
  const state = nextState(client)
  await command
  return state
}


test('Socket.IO: revealed cards are visible only on explicit owner action, and hidden again on request', async (t) => {
  const port = randomInt(31000, 39000)
  const url = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, ['apps/server/dist/index.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: 'pipe' })
  t.after(() => server.kill())
  let a, b
  t.after(() => { a?.disconnect(); b?.disconnect() })
  let lastError
  for (let attempt = 0; attempt < 30; attempt++) {
    try { a = await connect(url); break }
    catch (error) { lastError = error; await pause(75) }
  }
  if (!a) throw lastError
  b = await connect(url)
  const room = await ack(a, 'room:create', 'french')
  assert.equal(room.ok, true)
  const join = await ack(b, 'room:join', room.roomId)
  assert.equal(join.ok, true)
  const aDeal = stateAtLeast(a, join.table.version + 1)
  let bNext = stateAtLeast(b, join.table.version + 1)
  assert.equal((await ack(a, 'table:action', { type: 'deal', recipients: [room.playerId, join.playerId], cardsPerPlayer: 2 })).ok, true)
  const aliceView = await aDeal
  let bState = await bNext
  const firstHand = bState.hands.find(h => h.playerId === room.playerId)
  assert.equal(firstHand.cards.filter(c => c.rank).length, 0)
  const shownId = aliceView.hands.find(h => h.playerId === room.playerId).cards[0].id
  bNext = stateAtLeast(b, aliceView.version + 1)
  assert.equal((await ack(a, 'table:action', { type: 'reveal-hand', scope: 'selected', cardIds: [shownId], recipientIds: [join.playerId] })).ok, true)
  bState = await bNext
  assert.equal(bState.hands.find(h => h.playerId === room.playerId).cards.filter(c => c.rank).length, 1)
  assert.equal((await ack(b, 'table:action', { type: 'reveal-hand', scope: 'selected', cardIds: [shownId], recipientIds: [room.playerId] })).ok, false)
  bNext = stateAtLeast(b, bState.version + 1)
  assert.equal((await ack(a, 'table:action', { type: 'hide-hand' })).ok, true)
  bState = await bNext
  assert.equal(bState.hands.find(h => h.playerId === room.playerId).cards.filter(c => c.rank).length, 0)
})
