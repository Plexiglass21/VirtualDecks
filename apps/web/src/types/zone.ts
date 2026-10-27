import type { TableCard } from './card'

export type ZoneType =
  | 'generic'
  | 'discard'
  | 'community'

export type Zone = {
  id: string
  label: string
  type: ZoneType
  cards: TableCard[]
}