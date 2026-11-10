import type { LooseCard } from './card'
import type { Pile } from './pile'
import type { Hand } from './hand'
import type { Zone } from './zone'
import type { NormalizedPosition } from './position'

// A view for ONE player, never the server's private game state.
export type TableGameState = {
  version: number
  deckKind: 'french' | 'italian'
  deckCount: number
  deckPosition: NormalizedPosition
  looseCards: LooseCard[]
  piles: Pile[]
  hands: Hand[] // own cards + public placeholders/reveals for other players
  zones: Zone[]
}
