export type NormalizedPosition = {
  x: number
  y: number
}

export type Suit = '♠' | '♥' | '♦' | '♣'

export type Rank =| 'A'| '2'| '3'| '4'| '5'| '6'| '7'| '8'| '9'| '10'| 'J'| 'Q'| 'K'

export type Card = {
  id: string
  rank: Rank
  suit: Suit
}

export type TableCard = Card & {
  faceUp: boolean
}

export type LooseCard = TableCard & {
  position: NormalizedPosition
  zIndex: number
  spawnFrom?: NormalizedPosition
}

export type Hand = {
  id: string
  playerId: string
  cards: TableCard[]
}

export type Zone = {
  id: string
  label: string
  type: 'generic' | 'discard' | 'community'
  cards: TableCard[]
}

export type Pile = {
  id: string
  position: NormalizedPosition
  zIndex: number
  cards: TableCard[]
}

export type TableGameState = {
  deck: Card[]
  looseCards: LooseCard[]
  piles: Pile[]
  hands: Hand[]
  zones: Zone[]
}

const suits: Suit[] = ['♠', '♥', '♦', '♣']

const ranks: Rank[] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K',]

function createDeck(): Card[] {
  return suits.flatMap((suit) =>
    ranks.map((rank) => ({
      id: `${rank}-${suit}`,
      rank,
      suit,
    })),
  )
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items]

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))

    ;[result[i], result[j]] = [result[j], result[i]]
  }

  return result
}

export function createTable(
  firstPlayerId: string,
): TableGameState {
  return {
    deck: shuffle(createDeck()),

    looseCards: [],

    piles: [],

    hands: [
      {
        id: `${firstPlayerId}-hand`,
        playerId: firstPlayerId,
        cards: [],
      },
    ],

    zones: [
      {
        id: 'discard-zone',
        label: 'Discard',
        type: 'discard',
        cards: [],
      },
    ],
  }
}