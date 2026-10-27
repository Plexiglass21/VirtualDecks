import type { TableCard } from './card'
import type { TableObjectState } from './table'

export type Pile = TableObjectState & {
  id: string
  cards: TableCard[]
}