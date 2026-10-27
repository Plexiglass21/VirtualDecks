import type {TableCard } from '../types/card'

export type Hand = {
  id: string
  playerId: string
  cards: TableCard[]
}