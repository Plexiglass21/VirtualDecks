import type {Card} from '../types/card'
import { ranks, suits } from '../types/card'

//genero il mazzo con flatmap ottengo un array di 52 carte invece di 4 array di 13 carte
export const initialDeck: Card[] = 
    suits.flatMap(suit =>
        ranks.map(rank=>({
            id: `${rank}-${suit}`,
            rank,
            suit,
        }))
)