import type { CSSProperties } from 'react'

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

type Props = { suit: ItalianSuit; className?: string; style?: CSSProperties }

// Original vector emblems: unlike emoji or font glyphs, these render uniformly
// in every browser, at table size (76px cards) as well as in enlarged dialogs.
export function ItalianSuitIcon({ suit, className, style }: Props) {
  const color = italianSuitColors[suit]
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} fill="none" aria-hidden="true">
      {suit === 'coppe' && <>
        <path d="M24 15h52l-5 29C68 56 61 62 50 64 39 62 32 56 29 44Z" fill="#e8b966" stroke={color} strokeWidth="5" strokeLinejoin="round" />
        <path d="M27 25H14c-3 0-5 4-4 10 1 11 10 18 20 18M73 25h13c3 0 5 4 4 10-1 11-10 18-20 18" stroke={color} strokeWidth="6" strokeLinecap="round" />
        <path d="M50 64v20M33 88h34" stroke={color} strokeWidth="7" strokeLinecap="round" />
        <path d="M33 31h34M38 42h24" stroke="#fff0b7" strokeWidth="4" strokeLinecap="round" />
        <circle cx="50" cy="18" r="5" fill={color} />
      </>}
      {suit === 'denari' && <>
        <circle cx="50" cy="50" r="39" fill="#f2c467" stroke={color} strokeWidth="6" />
        <circle cx="50" cy="50" r="29" stroke={color} strokeWidth="3" />
        <circle cx="50" cy="50" r="19" fill="#df9f37" stroke={color} strokeWidth="2" />
        <path d="m50 33 5 11 12 1-9 8 3 13-11-7-11 7 3-13-9-8 12-1Z" fill="#fff0b7" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <circle cx="50" cy="14" r="2.5" fill={color}/><circle cx="50" cy="86" r="2.5" fill={color}/>
        <circle cx="14" cy="50" r="2.5" fill={color}/><circle cx="86" cy="50" r="2.5" fill={color}/>
      </>}
      {suit === 'bastoni' && <>
        <path d="M39 85 59 17c2-8 10-10 15-6 5 3 5 9 1 15L52 91c-2 6-10 6-13 2-2-2-2-5 0-8Z" fill="#c79b65" stroke={color} strokeWidth="6" strokeLinejoin="round" />
        <path d="M55 30 69 36M48 51l15 6M43 71l14 7" stroke={color} strokeWidth="3" strokeLinecap="round" />
        <path d="M53 44c-9-1-15-5-16-15M64 40c12-2 17-7 17-14" stroke={color} strokeWidth="5" strokeLinecap="round" />
        <path d="M37 28c-5-3-8-9-9-14M81 26c5-2 8-6 10-10" stroke="#688e53" strokeWidth="5" strokeLinecap="round" />
      </>}
      {suit === 'spade' && <>
        <path d="M51 8 62 38 54 71h-8l-8-33Z" fill="#c6d2d8" stroke={color} strokeWidth="4" strokeLinejoin="round" />
        <path d="M50 11v60" stroke="#eff2f0" strokeWidth="3" />
        <path d="M28 66c15 8 29 8 44 0" stroke={color} strokeWidth="7" strokeLinecap="round" />
        <path d="M50 72v17" stroke={color} strokeWidth="8" strokeLinecap="round" />
        <circle cx="50" cy="91" r="6" fill="#e8b966" stroke={color} strokeWidth="3" />
        <circle cx="26" cy="64" r="4" fill="#e8b966" stroke={color} strokeWidth="2" />
        <circle cx="74" cy="64" r="4" fill="#e8b966" stroke={color} strokeWidth="2" />
      </>}
    </svg>
  )
}
