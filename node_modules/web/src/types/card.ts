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

export type TableCard = {
  id: string
  faceUp: boolean
  // Hidden cards are serialized without rank/suit. The id is an opaque UUID.
  rank?: string
  suit?: string
}

// position is the card's centre, normalised to the table size.
// spawnFrom, when set, is where the card slides in from on first render.
export type LooseCard = TableCard & TableObjectState & {
  rotation: number
  spawnFrom?: NormalizedPosition
}