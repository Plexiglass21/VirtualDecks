import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inItalian } from '../src/utils/italian.ts'

test('server error descriptions are localized without changing the protocol', () => {
  assert.equal(inItalian('Room unavailable.'), 'Stanza non disponibile.')
  assert.equal(inItalian('Not enough cards in the deck.'), 'Non ci sono abbastanza carte nel mazzo.')
  assert.equal(inItalian('Discard'), 'Scarti')
})

test('host-transfer notices and deletions are shown in Italian', () => {
  assert.equal(inItalian('Giulia is now the room host.'), "Giulia ora è l'host della stanza.")
  assert.equal(inItalian('The host has deleted this room.'), "L'host ha eliminato la stanza.")
})

test('unexpected server messages remain visible instead of disappearing', () => {
  assert.equal(inItalian('Unexpected condition'), 'Unexpected condition')
})
