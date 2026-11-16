export type ItalianSuit = 'coppe' | 'denari' | 'bastoni' | 'spade'

export const italianSuits: readonly ItalianSuit[] = ['coppe', 'denari', 'bastoni', 'spade']

export function isItalianSuit(suit: string): suit is ItalianSuit {
  return italianSuits.includes(suit as ItalianSuit)
}

export const italianSuitNames: Record<ItalianSuit, string> = {
  coppe: 'COPPE', denari: 'DENARI', bastoni: 'BASTONI', spade: 'SPADE',
}

export const italianSuitColors: Record<ItalianSuit, string> = {
  coppe: '#a63c35', denari: '#b17e24', bastoni: '#32664a', spade: '#426384',
}
