import type { NormalizedPosition } from './position'
import type { TableObjectState } from './table'

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