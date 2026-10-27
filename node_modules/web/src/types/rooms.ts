import type { Player } from './player'
import type { TableGameState } from './game'

export type Room = {
  id: string
  players: Player[]
  table: TableGameState
}