import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newGame, addPlayer, removePlayer, applyAction, viewFor } from '../dist/game.js'

const validPosition = { x: 0.5, y: 0.5 }
const countCards = (game) => game.deck.length + game.looseCards.length + game.hands.reduce((n, hand) => n + hand.cards.length, 0) + game.piles.reduce((n, pile) => n + pile.cards.length, 0) + game.zones.reduce((n, zone) => n + zone.cards.length, 0)

test('French 52, Italian 40, opaque IDs unique and unrelated to faces', () => {
  for (const [kind, size] of [['french', 52], ['italian', 40]]) {
    const game = newGame('alice', kind)
    assert.equal(game.deck.length, size)
    assert.equal(new Set(game.deck.map(c => c.id)).size, size)
    assert.ok(game.deck.every(c => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(c.id)))
    assert.equal(viewFor(game, 'alice').deckCount, size)
    assert.equal('deck' in viewFor(game, 'alice'), false)
  }
})

test('Other clients receive only anonymous hand placeholders; face-down cards hide faces', () => {
  const game = newGame('alice')
  addPlayer(game, 'bob')
  assert.equal(applyAction(game, 'alice', { type: 'draw-hand' }).ok, true)
  const alice = viewFor(game, 'alice')
  const bob = viewFor(game, 'bob')
  assert.equal(alice.hands.length, 2)
  assert.equal(bob.hands.length, 2)
  assert.equal(alice.hands.find(h => h.playerId === 'alice').cards.length, 1)
  assert.equal(bob.hands.find(h => h.playerId === 'alice').cards.length, 1)
  assert.equal(bob.hands.find(h => h.playerId === 'alice').cards[0].rank, undefined)
  const secretId = alice.hands.find(h => h.playerId === 'alice').cards[0].id
  assert.equal(JSON.stringify(bob).includes(secretId), false)
  assert.equal(applyAction(game, 'bob', { type: 'hand-to-table', cardId: secretId, position: validPosition }).ok, false)
  assert.equal(applyAction(game, 'alice', { type: 'hand-to-table', cardId: secretId, position: validPosition }).ok, true)
  assert.equal(applyAction(game, 'bob', { type: 'flip-cards', cardIds: [secretId] }).ok, true)
  assert.equal(viewFor(game, 'bob').looseCards[0].rank, undefined)
  assert.equal(viewFor(game, 'alice').looseCards[0].suit, undefined)
})

test('Server rejects bad input without changing version or cards', () => {
  const game = newGame('alice')
  const originalVersion = game.version
  const cases = [null, { type: 'draw-table', landingPosition: { x: NaN, y: 0.5 } },
    { type: 'move-cards', moves: [{ id: 'nonexistent', position: validPosition }] },
    { type: 'flip-cards', cardIds: ['x', 'x'] }, { type: 'reset', admin: true, id: 'ignored' },
  ]
  for (const action of cases.filter(a => a?.type !== 'reset')) {
    assert.equal(applyAction(game, 'alice', action).ok, false)
  }
  assert.equal(game.version, originalVersion)
  assert.equal(countCards(game), 52)
})

test('All card operations preserve total cards, reject stale simultaneous moves', () => {
  const game = newGame('alice')
  addPlayer(game, 'bob')
  assert.equal(applyAction(game, 'alice', { type: 'draw-table', landingPosition: validPosition }).ok, true)
  assert.equal(applyAction(game, 'bob', { type: 'draw-table', landingPosition: { x: 0.65, y: 0.5 } }).ok, true)
  const ids = game.looseCards.map(c => c.id)
  assert.equal(applyAction(game, 'alice', { type: 'create-pile', cardIds: ids }).ok, true)
  assert.equal(countCards(game), 52)
  assert.equal(applyAction(game, 'bob', { type: 'table-to-hand', cardIds: [ids[0]] }).ok, false)
  const pileId = game.piles[0].id
  assert.equal(applyAction(game, 'bob', { type: 'extract-pile', pileId }).ok, true)
  assert.equal(countCards(game), 52)
  const freeId = game.looseCards[0].id
  assert.equal(applyAction(game, 'alice', { type: 'table-to-zone', zoneId: 'discard-zone', cardIds: [freeId] }).ok, true)
  assert.equal(applyAction(game, 'alice', { type: 'extract-zone', zoneId: 'discard-zone', position: validPosition }).ok, true)
  assert.equal(applyAction(game, 'bob', { type: 'table-to-hand', cardIds: [freeId] }).ok, true)
  assert.equal(applyAction(game, 'alice', { type: 'table-to-hand', cardIds: [freeId] }).ok, false)
  assert.equal(countCards(game), 52)
  assert.equal(applyAction(game, 'alice', { type: 'reset' }).ok, true)
  assert.equal(countCards(game), 52)
})


test('Face-down cards stay confidential inside piles and discard zones', () => {
  const game = newGame('alice')
  applyAction(game, 'alice', { type: 'draw-table', landingPosition: { x: .3, y: .4 } })
  applyAction(game, 'alice', { type: 'draw-table', landingPosition: { x: .4, y: .4 } })
  const ids = game.looseCards.map(c => c.id)
  assert.equal(applyAction(game, 'alice', { type: 'flip-cards', cardIds: ids }).ok, true)
  assert.equal(applyAction(game, 'alice', { type: 'create-pile', cardIds: ids }).ok, true)
  const pileView = viewFor(game, 'alice').piles[0]
  assert.equal(pileView.cards[0].rank, undefined)
  assert.equal(pileView.cards[1].suit, undefined)
  applyAction(game, 'alice', { type: 'extract-pile', pileId: pileView.id })
  assert.equal(applyAction(game, 'alice', { type: 'table-to-zone', zoneId: 'discard-zone', cardIds: [ids[1]] }).ok, true)
  const visibleDiscard = viewFor(game, 'alice').zones[0].cards[0]
  assert.equal(visibleDiscard.rank, undefined)
  assert.equal(visibleDiscard.suit, undefined)
  assert.equal(countCards(game), 52)
})


test('Deal distributes round robin, conserves cards and validates recipients/availability', () => {
  const game = newGame('alice')
  addPlayer(game, 'bob')
  addPlayer(game, 'carl')
  const firstCards = game.deck.slice(0, 9).map(card => card.id)
  const result = applyAction(game, 'alice', { type: 'deal', recipients: ['alice', 'bob', 'carl'], cardsPerPlayer: 3 }, new Set(['alice', 'bob', 'carl']))
  assert.equal(result.ok, true)
  assert.equal(game.deck.length, 43)
  assert.equal(countCards(game), 52)
  assert.deepEqual(game.hands.find(h => h.playerId === 'alice').cards.map(c => c.id), [firstCards[0], firstCards[3], firstCards[6]])
  assert.deepEqual(game.hands.find(h => h.playerId === 'bob').cards.map(c => c.id), [firstCards[1], firstCards[4], firstCards[7]])
  assert.equal(viewFor(game, 'alice').hands.find(h => h.playerId === 'bob').cards[0].rank, undefined)
  const version = game.version
  assert.equal(applyAction(game, 'alice', { type: 'deal', recipients: ['alice', 'nobody'], cardsPerPlayer: 2 }).ok, false)
  assert.equal(applyAction(game, 'alice', { type: 'deal', recipients: ['alice', 'bob'], cardsPerPlayer: 25 }).ok, false)
  assert.equal(applyAction(game, 'alice', { type: 'deal', recipients: ['bob'], cardsPerPlayer: 1 }, new Set(['alice'])).ok, false)
  assert.equal(game.version, version)
  assert.equal(countCards(game), 52)
})

test('Reveal selected/entire hand and hide: only owner controls visibility, future draws stay private', () => {
  const game = newGame('alice')
  addPlayer(game, 'bob')
  assert.equal(applyAction(game, 'alice', { type: 'deal', recipients: ['alice'], cardsPerPlayer: 3 }).ok, true)
  const aliceIds = game.hands[0].cards.map(c => c.id)
  const before = viewFor(game, 'bob').hands.find(h => h.playerId === 'alice')
  assert.equal(before.cards.length, 3)
  assert.ok(before.cards.every(c => !c.rank && !aliceIds.includes(c.id)))

  const previousVersion = game.version
  assert.equal(applyAction(game, 'bob', { type: 'reveal-hand', scope: 'selected', cardIds: [aliceIds[0]], recipientIds: ['alice'] }).ok, false)
  assert.equal(applyAction(game, 'alice', { type: 'reveal-hand', scope: 'selected', cardIds: ['fake'], recipientIds: ['bob'] }).ok, false)
  assert.equal(game.version, previousVersion)
  assert.equal(applyAction(game, 'alice', { type: 'reveal-hand', scope: 'selected', cardIds: [aliceIds[0], aliceIds[2]], recipientIds: ['bob'] }).ok, true)
  let bobView = viewFor(game, 'bob').hands.find(h => h.playerId === 'alice')
  assert.deepEqual(bobView.cards.filter(c => c.rank).map(c => c.id), [aliceIds[0], aliceIds[2]])
  assert.equal(bobView.cards[1].rank, undefined)
  assert.equal(applyAction(game, 'alice', { type: 'reveal-hand', scope: 'all', recipientIds: ['bob'] }).ok, true)
  assert.equal(viewFor(game, 'bob').hands.find(h => h.playerId === 'alice').cards.filter(c => c.rank).length, 3)

  assert.equal(applyAction(game, 'alice', { type: 'draw-hand' }).ok, true)
  bobView = viewFor(game, 'bob').hands.find(h => h.playerId === 'alice')
  assert.equal(bobView.cards.length, 4)
  assert.equal(bobView.cards.filter(c => c.rank).length, 3)
  assert.equal(bobView.cards[3].rank, undefined)
  assert.equal(applyAction(game, 'alice', { type: 'hide-hand' }).ok, true)
  assert.ok(viewFor(game, 'bob').hands.find(h => h.playerId === 'alice').cards.every(c => c.rank === undefined))
  assert.equal(countCards(game), 52)
})

test('Revealed cards stop being shared when played, discarded or table resets', () => {
  const game = newGame('alice')
  addPlayer(game, 'bob')
  applyAction(game, 'alice', { type: 'draw-hand' })
  applyAction(game, 'alice', { type: 'draw-hand' })
  const [first, second] = game.hands[0].cards.map(c => c.id)
  applyAction(game, 'alice', { type: 'reveal-hand', scope: 'all', recipientIds: ['bob'] })
  assert.equal(applyAction(game, 'alice', { type: 'hand-to-table', cardId: first, position: validPosition }).ok, true)
  assert.equal(viewFor(game, 'bob').hands[0].cards.filter(c => c.rank).length, 1)
  assert.equal(applyAction(game, 'alice', { type: 'hand-to-zone', cardId: second, zoneId: 'discard-zone' }).ok, true)
  assert.equal(viewFor(game, 'bob').hands[0].cards.length, 0)
  assert.equal(game.hands[0].revealedCardIds.length, 0)
  applyAction(game, 'alice', { type: 'reset' })
  assert.equal(game.hands[0].revealedCardIds.length, 0)
  assert.equal(countCards(game), 52)
})

test('Rotate selected table cards and piles, flip and shuffle piles without changing total', () => {
  const game = newGame('alice')
  applyAction(game, 'alice', { type: 'draw-table', landingPosition: validPosition })
  applyAction(game, 'alice', { type: 'draw-table', landingPosition: validPosition })
  const cardIds = game.looseCards.map(c => c.id)
  assert.equal(applyAction(game, 'alice', { type: 'rotate-cards', cardIds, degrees: 90 }).ok, true)
  assert.ok(game.looseCards.every(c => c.rotation === 90))
  assert.equal(applyAction(game, 'alice', { type: 'rotate-cards', cardIds, degrees: 8 }).ok, false)
  applyAction(game, 'alice', { type: 'create-pile', cardIds })
  const pileId = game.piles[0].id
  assert.equal(applyAction(game, 'alice', { type: 'rotate-pile', pileId, degrees: 90 }).ok, true)
  assert.equal(game.piles[0].rotation, 90)
  assert.equal(applyAction(game, 'alice', { type: 'flip-pile', pileId }).ok, true)
  assert.ok(game.piles[0].cards.every(card => !card.faceUp))
  assert.equal(applyAction(game, 'alice', { type: 'shuffle-pile', pileId }).ok, true)
  assert.equal(countCards(game), 52)
  assert.equal(viewFor(game, 'alice').piles[0].rotation, 90)
  assert.ok(viewFor(game, 'alice').piles[0].cards.every(c => c.rank === undefined))
})


test('Hand is revealed only to selected recipients', () => {
  const game = newGame('alice')
  addPlayer(game, 'bob')
  addPlayer(game, 'carl')
  applyAction(game, 'alice', { type: 'deal', recipients: ['alice'], cardsPerPlayer: 3 })
  const cardId = game.hands[0].cards[0].id
  const result = applyAction(game, 'alice', { type: 'reveal-hand', scope: 'selected', cardIds: [cardId], recipientIds: ['bob'] }, new Set(['alice', 'bob', 'carl']))
  assert.equal(result.ok, true)
  const bobView = viewFor(game, 'bob')
  const carlView = viewFor(game, 'carl')
  assert.equal(bobView.hands[0].cards.filter(c => c.rank).length, 1)
  assert.equal(carlView.hands[0].cards.filter(c => c.rank).length, 0)
  assert.equal(JSON.stringify(carlView).includes(cardId), false)
})


test('Leaving permanently returns private cards to the deck and clears recipient grants', () => {
  const game = newGame('alice')
  addPlayer(game, 'bob')
  applyAction(game, 'alice', { type: 'deal', recipients: ['alice', 'bob'], cardsPerPlayer: 3 })
  const bobId = game.hands.find(h => h.playerId === 'bob').cards[0].id
  applyAction(game, 'bob', { type: 'reveal-hand', scope: 'all', recipientIds: ['alice'] })
  applyAction(game, 'alice', { type: 'reveal-hand', scope: 'all', recipientIds: ['bob'] })
  const before = game.version
  removePlayer(game, 'bob')
  assert.equal(game.version, before + 1)
  assert.equal(game.hands.length, 1)
  assert.equal(game.hands[0].revealedToPlayerIds.includes('bob'), false)
  assert.equal(game.deck.some(c => c.id === bobId), true)
  assert.equal(countCards(game), 52)
})
