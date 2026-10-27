import type { NormalizedPosition } from './position'
import type { TableObjectState } from './table'

export const suits = ['♠', '♥', '♦', '♣'] as const

export const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K',] as const

export type Suit = (typeof suits)[number]
export type Rank = (typeof ranks)[number]

export type Card = {
  id: string
  rank: Rank
  suit: Suit
}

export type TableCard = Card & {
  faceUp: boolean
}

// position is the card's centre, normalised to the table size.
// spawnFrom, when set, is where the card slides in from on first render.
export type LooseCard = TableCard & TableObjectState & {
  spawnFrom?: NormalizedPosition
}