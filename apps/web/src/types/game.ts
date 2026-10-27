import type { Card, LooseCard } from './card'
import type { Pile } from './pile'
import type { Hand } from './hand'
import type { Zone } from './zone'

export type TableGameState = {
  deck: Card[]
  looseCards: LooseCard[]
  piles: Pile[]
  hands: Hand[]
  zones: Zone[]
}