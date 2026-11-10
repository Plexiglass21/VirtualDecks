import { randomInt, randomUUID } from 'node:crypto'

export type Point = { x: number; y: number }
export type DeckKind = 'french' | 'italian'
export type Card = { id: string; rank: string; suit: string }
export type TableCard = Card & { faceUp: boolean }
export type LooseCard = TableCard & { position: Point; zIndex: number; rotation: number; spawnFrom?: Point }
export type Pile = { id: string; position: Point; zIndex: number; rotation: number; cards: TableCard[] }
export type Hand = { id: string; playerId: string; cards: TableCard[]; revealedCardIds: string[]; revealedToPlayerIds: string[] }
export type Zone = { id: string; label: string; type: 'discard'; cards: TableCard[] }

// Internal state MUST NEVER be emitted to the room. It contains every card identity.
export type Game = {
  deckKind: DeckKind
  version: number
  deck: Card[]
  deckPosition: Point
  looseCards: LooseCard[]
  piles: Pile[]
  hands: Hand[]
  zones: Zone[]
}

// Public representations contain no data about unseen cards.
type VisibleCard = { id: string; faceUp: boolean; rank?: string; suit?: string }
export type GameView = {
  deckKind: DeckKind
  version: number
  deckCount: number
  deckPosition: Point
  looseCards: (VisibleCard & { position: Point; zIndex: number; rotation: number; spawnFrom?: Point })[]
  piles: { id: string; position: Point; zIndex: number; rotation: number; cards: VisibleCard[] }[]
  hands: { id: string; playerId: string; cards: VisibleCard[]; revealedCardIds: string[]; revealedToPlayerIds: string[] }[]
  zones: { id: string; label: string; type: 'discard'; cards: VisibleCard[] }[]
}

export type Action =
  | { type: 'draw-table'; landingPosition: Point; spawnFrom?: Point }
  | { type: 'draw-hand' }
  | { type: 'deal'; recipients: string[]; cardsPerPlayer: number }
  | { type: 'reveal-hand'; scope: 'all' | 'selected'; cardIds?: string[]; recipientIds: string[] }
  | { type: 'hide-hand' }
  | { type: 'rotate-cards'; cardIds: string[]; degrees: -90 | 90 | 180 }
  | { type: 'move-cards'; moves: { id: string; position: Point }[]; pileId?: string }
  | { type: 'front-card'; cardId: string }
  | { type: 'flip-cards'; cardIds: string[] }
  | { type: 'create-pile'; cardIds: string[] }
  | { type: 'move-pile'; pileId: string; position: Point }
  | { type: 'front-pile'; pileId: string }
  | { type: 'rotate-pile'; pileId: string; degrees: -90 | 90 | 180 }
  | { type: 'flip-pile'; pileId: string }
  | { type: 'shuffle-pile'; pileId: string }
  | { type: 'extract-pile'; pileId: string }
  | { type: 'table-to-hand'; cardIds: string[] }
  | { type: 'hand-to-table'; cardId: string; position: Point }
  | { type: 'table-to-zone'; cardIds: string[]; zoneId: string }
  | { type: 'hand-to-zone'; cardId: string; zoneId: string }
  | { type: 'extract-zone'; zoneId: string; position: Point }
  | { type: 'shuffle' }
  | { type: 'reset' }
  | { type: 'move-deck'; position: Point }

const definitions: Record<DeckKind, { suits: string[]; ranks: string[] }> = {
  french: { suits: ['♠', '♥', '♦', '♣'], ranks: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] },
  italian: { suits: ['coppe', 'denari', 'bastoni', 'spade'], ranks: ['A', '2', '3', '4', '5', '6', '7', 'F', 'C', 'R'] },
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
      ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function freshDeck(kind: DeckKind): Card[] {
  const { suits, ranks } = definitions[kind]
  return shuffle(suits.flatMap((suit) => ranks.map((rank) => ({ id: randomUUID(), suit, rank }))))
}

export function newGame(playerId: string, deckKind: DeckKind = 'french'): Game {
  return {
    deckKind, version: 0, deck: freshDeck(deckKind), deckPosition: { x: 0.12, y: 0.46 },
    looseCards: [], piles: [], hands: [{ id: `${playerId}-hand`, playerId, cards: [], revealedCardIds: [], revealedToPlayerIds: [] }],
    zones: [{ id: 'discard-zone', label: 'Discard', type: 'discard', cards: [] }],
  }
}

export function addPlayer(game: Game, playerId: string) {
  game.hands.push({ id: `${playerId}-hand`, playerId, cards: [], revealedCardIds: [], revealedToPlayerIds: [] })
  game.version++
}

/** Explicit exit: invalidate the hand and put its cards back into the shuffled deck. */
export function removePlayer(game: Game, playerId: string) {
  const hand = game.hands.find((candidate) => candidate.playerId === playerId)
  if (!hand) return
  game.deck = shuffle([...game.deck, ...hand.cards.map(({ id, rank, suit }) => ({ id, rank, suit }))])
  game.hands = game.hands.filter((candidate) => candidate.playerId !== playerId)
  for (const remaining of game.hands) {
    remaining.revealedToPlayerIds = remaining.revealedToPlayerIds.filter((id) => id !== playerId)
  }
  game.version++
}

function visibleCard(card: TableCard, reveal: boolean): VisibleCard {
  return reveal ? { id: card.id, faceUp: card.faceUp, rank: card.rank, suit: card.suit }
    : { id: card.id, faceUp: card.faceUp }
}

export function viewFor(game: Game, playerId: string): GameView {
  return {
    deckKind: game.deckKind, version: game.version, deckCount: game.deck.length,
    deckPosition: { ...game.deckPosition },
    looseCards: game.looseCards.map((card) => ({ ...visibleCard(card, card.faceUp), position: { ...card.position }, zIndex: card.zIndex, rotation: card.rotation, ...(card.spawnFrom ? { spawnFrom: { ...card.spawnFrom } } : {}) })),
    piles: game.piles.map((pile) => ({ id: pile.id, position: { ...pile.position }, zIndex: pile.zIndex, rotation: pile.rotation, cards: pile.cards.map((card) => visibleCard(card, card.faceUp)) })),
    // Everybody can see how many cards other hands hold, but ONLY explicitly
    // revealed faces are transmitted. Hidden placeholders never contain card UUIDs.
    hands: game.hands.map((hand) => {
      const owner = hand.playerId === playerId
      const shown = new Set(hand.revealedCardIds)
      const canSeeRevealed = owner || hand.revealedToPlayerIds.includes(playerId)
      return {
        id: hand.id,
        playerId: hand.playerId,
        revealedCardIds: owner ? [...hand.revealedCardIds] : [],
        revealedToPlayerIds: owner ? [...hand.revealedToPlayerIds] : [],
        cards: hand.cards.map((card, index) =>
          owner 
            ? { ...visibleCard(card, true), faceUp: true }
            : canSeeRevealed 
            && shown.has(card.id)
              ? {...visibleCard(card, true), faceUp: true}
              : { id: `hidden-${hand.playerId}-${index}`, faceUp: false}
        ),
      }
    }),
    zones: game.zones.map((zone) => ({ id: zone.id, label: zone.label, type: zone.type, cards: zone.cards.map((card) => visibleCard(card, card.faceUp)) })),
  }
}

const point = (value: unknown): value is Point =>
  !!value && typeof value === 'object' && 'x' in value && 'y' in value &&
  typeof value.x === 'number' && typeof value.y === 'number' &&
  Number.isFinite(value.x) && Number.isFinite(value.y) &&
  value.x >= 0 && value.x <= 1 && value.y >= 0 && value.y <= 1

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length < 128
const ids = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.length <= 52 && value.every(text) && new Set(value).size === value.length
const clamp = (number: number) => Math.min(0.96, Math.max(0.04, number))
const degrees = (value: unknown): value is -90 | 90 | 180 => value === -90 || value === 90 || value === 180
const rotated = (current: number, by: number) => ((current + by) % 360 + 360) % 360
const maxZ = (game: Game) => Math.max(0, ...game.looseCards.map((card) => card.zIndex), ...game.piles.map((pile) => pile.zIndex))
const asTable = (card: TableCard): TableCard => ({ id: card.id, rank: card.rank, suit: card.suit, faceUp: card.faceUp })
const ownHand = (game: Game, playerId: string) => game.hands.find((hand) => hand.playerId === playerId)

/** The only place that mutates game state. A rejected action changes nothing. */
export function applyAction(game: Game, playerId: string, input: unknown, activePlayerIds?: ReadonlySet<string>): { ok: true; version: number } | { ok: false; error: string } {
  const reject = (error: string): { ok: false; error: string } => ({ ok: false, error })
  if (!record(input) || typeof input.type !== 'string') return reject('Invalid action.')
  if (!ownHand(game, playerId)) return reject('Player not in this table.')
  const action = input as Record<string, unknown>
  const findCards = (cardIds: string[]) => {
    const cards = cardIds.map((id) => game.looseCards.find((card) => card.id === id))
    return cards.every((card) => card !== undefined) ? cards as LooseCard[] : null
  }
  const removeCards = (cardIds: string[]) => {
    const remove = new Set(cardIds)
    game.looseCards = game.looseCards.filter((card) => !remove.has(card.id))
  }
  const appendHand = (cards: TableCard[]) => ownHand(game, playerId)!.cards.push(...cards.map(asTable))
  const appendZone = (zoneId: string, cards: TableCard[]) => game.zones.find((zone) => zone.id === zoneId)!.cards.push(...cards.map(asTable))

  switch (action.type) {
    case 'draw-table': {
      if (!point(action.landingPosition) || (action.spawnFrom !== undefined && !point(action.spawnFrom))) return reject('Invalid position.')
      if (!game.deck.length) return reject('The deck is empty.')
      const card = game.deck.shift()!
      const offset = (game.looseCards.length % 3) * 0.02
      game.looseCards.push({ ...card, faceUp: true, position: { x: clamp(action.landingPosition.x + offset), y: clamp(action.landingPosition.y + offset) }, rotation: 0, ...(action.spawnFrom ? { spawnFrom: action.spawnFrom as Point } : {}), zIndex: maxZ(game) + 1 })
      break
    }
    case 'draw-hand': {
      if (!game.deck.length) return reject('The deck is empty.')
      appendHand([{ ...game.deck.shift()!, faceUp: true }])
      break
    }
    case 'deal': {
      if (!ids(action.recipients) || !Number.isInteger(action.cardsPerPlayer)) return reject('Invalid deal.')
      const recipients = action.recipients as string[]
      const count = action.cardsPerPlayer as number
      if (count < 1 || count > 52 || recipients.length * count > game.deck.length) return reject('Not enough cards in the deck.')
      const targetHands = recipients.map((id) => ownHand(game, id))
      if (targetHands.some((hand) => !hand) || (activePlayerIds && recipients.some((id) => !activePlayerIds.has(id)))) return reject('Unknown or disconnected recipient.')
      // Round-robin: distribute one card to each recipient before the next round.
      for (let n = 0; n < count; n++) {
        for (const hand of targetHands) hand!.cards.push({ ...game.deck.shift()!, faceUp: true })
      }
      break
    }
    case 'reveal-hand': {
      const hand = ownHand(game, playerId)!

      if (!hand.cards.length) return reject('Your hand is empty.')

      if (!ids(action.recipientIds)) return reject('Select at least one recipient.')

      const recipients = action.recipientIds as string[]

      if (recipients.some((id) => id === playerId || !ownHand(game, id) || (activePlayerIds && !activePlayerIds.has(id)))) return reject('Invalid or disconnected recipient.')

      if (action.scope === 'all') {
        hand.revealedCardIds = hand.cards.map((card) => card.id)
      } else if (action.scope === 'selected') {
        if (!ids(action.cardIds)) return reject('Select cards from your hand.')

        const ownIds = new Set(hand.cards.map((card) => card.id))

        const selectedIds = action.cardIds as string[]

        if (!selectedIds.every((id) => ownIds.has(id))) return reject('You can only reveal your own cards.')

        hand.revealedCardIds = [...selectedIds]
      } else {
        return reject('Invalid reveal scope.')
      }

      hand.revealedToPlayerIds = [...recipients]

      break
    }

    case 'hide-hand': {
      const hand = ownHand(game, playerId)!

      hand.revealedCardIds = []
      hand.revealedToPlayerIds = []

      break
    }
    case 'rotate-cards': {
      if (!ids(action.cardIds) || !degrees(action.degrees)) return reject('Invalid rotation.')
      const cards = findCards(action.cardIds)
      if (!cards) return reject('Card no longer on the table.')
      for (const card of cards) card.rotation = rotated(card.rotation, action.degrees)
      break
    }
    case 'move-cards': {
      if (!Array.isArray(action.moves) || !action.moves.length || action.moves.length > 52 || !action.moves.every((move) => record(move) && text(move.id) && point(move.position))) return reject('Invalid card movement.')
      const moves = action.moves as { id: string; position: Point }[]
      if (!ids(moves.map((move) => move.id))) return reject('Duplicate cards.')
      const cards = findCards(moves.map((move) => move.id))
      if (!cards) return reject('Card no longer on the table.')
      if (action.pileId !== undefined) {
        if (!text(action.pileId)) return reject('Invalid pile.')
        const pile = game.piles.find((pile) => pile.id === action.pileId)
        if (!pile) return reject('Pile not found.')
        // Proximity is checked on the server, not merely by the drag UI.
        if (moves.some((move) => Math.abs(move.position.x - pile.position.x) > 0.08 || Math.abs(move.position.y - pile.position.y) > 0.08)) return reject('Drop must be on the pile.')
        pile.cards.push(...cards.sort((a, b) => a.zIndex - b.zIndex).map(asTable))
        pile.zIndex = maxZ(game) + 1
        removeCards(cards.map((card) => card.id))
      } else {
        const byId = new Map(moves.map((move) => [move.id, move.position]))
        game.looseCards = game.looseCards.map((card) => byId.has(card.id) ? { ...card, position: byId.get(card.id)! } : card)
      }
      break
    }
    case 'front-card': {
      if (!text(action.cardId)) return reject('Invalid card.')
      const card = game.looseCards.find((card) => card.id === action.cardId)
      if (!card) return reject('Card not found.')
      card.zIndex = maxZ(game) + 1
      break
    }
    case 'flip-cards': {
      if (!ids(action.cardIds)) return reject('Select valid cards.')
      const cards = findCards(action.cardIds)
      if (!cards) return reject('Card no longer on the table.')
      for (const card of cards) card.faceUp = !card.faceUp
      break
    }
    case 'create-pile': {
      if (!ids(action.cardIds) || action.cardIds.length < 2) return reject('Select at least two cards.')
      const cards = findCards(action.cardIds)
      if (!cards) return reject('Card no longer on the table.')
      cards.sort((a, b) => a.zIndex - b.zIndex)
      game.piles.push({ id: randomUUID(), position: { ...cards[cards.length - 1].position }, zIndex: maxZ(game) + 1, rotation: 0, cards: cards.map(asTable) })
      removeCards(action.cardIds)
      break
    }
    case 'move-pile': {
      if (!text(action.pileId) || !point(action.position)) return reject('Invalid pile or position.')
      const pile = game.piles.find((pile) => pile.id === action.pileId)
      if (!pile) return reject('Pile not found.')
      pile.position = action.position
      break
    }
    case 'front-pile': {
      if (!text(action.pileId)) return reject('Invalid pile.')
      const pile = game.piles.find((pile) => pile.id === action.pileId)
      if (!pile) return reject('Pile not found.')
      pile.zIndex = maxZ(game) + 1
      break
    }
    case 'rotate-pile': {
      if (!text(action.pileId) || !degrees(action.degrees)) return reject('Invalid pile rotation.')
      const pile = game.piles.find((pile) => pile.id === action.pileId)
      if (!pile) return reject('Pile not found.')
      pile.rotation = rotated(pile.rotation, action.degrees)
      break
    }
    case 'flip-pile': {
      if (!text(action.pileId)) return reject('Invalid pile.')
      const pile = game.piles.find((pile) => pile.id === action.pileId)
      if (!pile) return reject('Pile not found.')
      for (const card of pile.cards) card.faceUp = !card.faceUp
      break
    }
    case 'shuffle-pile': {
      if (!text(action.pileId)) return reject('Invalid pile.')
      const pile = game.piles.find((pile) => pile.id === action.pileId)
      if (!pile) return reject('Pile not found.')
      pile.cards = shuffle(pile.cards)
      break
    }
    case 'extract-pile': {
      if (!text(action.pileId)) return reject('Invalid pile.')
      const pile = game.piles.find((pile) => pile.id === action.pileId)
      if (!pile || !pile.cards.length) return reject('Pile is empty or missing.')
      const card = pile.cards.pop()!
      game.looseCards.push({ ...card, position: { x: clamp(pile.position.x + 0.06), y: clamp(pile.position.y + 0.04) }, spawnFrom: pile.position, rotation: pile.rotation, zIndex: maxZ(game) + 1 })
      if (!pile.cards.length) game.piles = game.piles.filter((candidate) => candidate.id !== pile.id)
      break
    }
    case 'table-to-hand': {
      if (!ids(action.cardIds)) return reject('Invalid cards.')
      const cards = findCards(action.cardIds)
      if (!cards) return reject('Card no longer on the table.')
      appendHand(cards.sort((a, b) => a.zIndex - b.zIndex))
      removeCards(action.cardIds)
      break
    }
    case 'hand-to-table': {
      if (!text(action.cardId) || !point(action.position)) return reject('Invalid card or position.')
      const hand = ownHand(game, playerId)!
      const card = hand.cards.find((card) => card.id === action.cardId)
      if (!card) return reject('Card is not in your hand.')
      hand.cards = hand.cards.filter((candidate) => candidate.id !== card.id)
      hand.revealedCardIds = hand.revealedCardIds.filter((id) => id !== card.id)
      game.looseCards.push({ ...card, position: action.position, rotation: 0, zIndex: maxZ(game) + 1 })
      break
    }
    case 'table-to-zone': {
      if (!ids(action.cardIds) || !text(action.zoneId)) return reject('Invalid cards or zone.')
      if (!game.zones.some((zone) => zone.id === action.zoneId)) return reject('Zone not found.')
      const cards = findCards(action.cardIds)
      if (!cards) return reject('Card no longer on the table.')
      appendZone(action.zoneId, cards.sort((a, b) => a.zIndex - b.zIndex))
      removeCards(action.cardIds)
      break
    }
    case 'hand-to-zone': {
      if (!text(action.cardId) || !text(action.zoneId)) return reject('Invalid card or zone.')
      const hand = ownHand(game, playerId)!
      const card = hand.cards.find((card) => card.id === action.cardId)
      if (!card || !game.zones.some((zone) => zone.id === action.zoneId)) return reject('Card or zone not found.')
      hand.cards = hand.cards.filter((candidate) => candidate.id !== card.id)
      hand.revealedCardIds = hand.revealedCardIds.filter((id) => id !== card.id)
      appendZone(action.zoneId, [card])
      break
    }
    case 'extract-zone': {
      if (!text(action.zoneId) || !point(action.position)) return reject('Invalid zone or position.')
      const zone = game.zones.find((zone) => zone.id === action.zoneId)
      if (!zone || !zone.cards.length) return reject('Zone is empty or missing.')
      game.looseCards.push({ ...zone.cards.pop()!, position: action.position, rotation: 0, zIndex: maxZ(game) + 1 })
      break
    }
    case 'shuffle':
      game.deck = shuffle(game.deck)
      break
    case 'reset': {
      game.deck = freshDeck(game.deckKind)
      game.deckPosition = { x: 0.12, y: 0.46 }
      game.looseCards = []
      game.piles = []
      for (const hand of game.hands) { hand.cards = []; hand.revealedCardIds = []; hand.revealedToPlayerIds = [] }
      for (const zone of game.zones) zone.cards = []
      break
    }
    case 'move-deck':
      if (!point(action.position)) return reject('Invalid deck position.')
      game.deckPosition = action.position
      break
    default:
      return reject('Unknown action.')
  }

  game.version++
  return { ok: true, version: game.version }
}
