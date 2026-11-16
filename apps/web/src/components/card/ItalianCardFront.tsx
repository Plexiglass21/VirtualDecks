import { ItalianSuitIcon } from './ItalianSuitIcon'
import { italianSuitColors, italianSuitNames, type ItalianSuit } from './italianSuitData'

type Props = { rank: string; suit: ItalianSuit }

// The server's Italian pack contains A, 2-7, F, C, R (40 cards).
// All SVG coordinates use the same 112x160 viewBox so numbers, pips and
// illustrated figures scale correctly, even inside small mobile hands.
const pipPositions: Record<string, Array<[number, number]>> = {
  '2': [[56, 49], [56, 108]],
  '3': [[56, 40], [56, 78], [56, 116]],
  '4': [[35, 46], [77, 46], [35, 108], [77, 108]],
  '5': [[35, 43], [77, 43], [56, 78], [35, 113], [77, 113]],
  '6': [[35, 38], [77, 38], [35, 78], [77, 78], [35, 118], [77, 118]],
  '7': [[35, 39], [77, 39], [35, 75], [56, 75], [77, 75], [35, 112], [77, 112]],
}

const figureNames: Record<string, string> = { F: 'FANTE', C: 'CAVALLO', R: 'RE' }

function CourtFigure({ rank, suit }: Props) {
  const color = italianSuitColors[suit]
  return (
    <g>
      <rect x="28" y="35" width="56" height="95" rx="4" fill="#f0e5cd" stroke={color} strokeWidth="1.5" />
      <path d="M29 118 Q56 100 83 118V128H29Z" fill={color} opacity="0.2" />
      {rank === 'C' ? <>
        {/* Mounted knight: the horse silhouette differentiates Cavallo from Fante. */}
        <path d="M38 88Q44 72 63 81L67 94 73 105H42Z" fill="#bd9870" stroke="#75543a" strokeWidth="2" />
        <path d="M60 82 65 63 74 61 80 70 77 85 67 88Z" fill="#cfb08b" stroke="#75543a" strokeWidth="2" />
        <path d="M72 68l7 4M44 102l-4 16m19-16 4 16M66 103l6 15" stroke="#75543a" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M38 87Q30 77 34 66" stroke="#75543a" strokeWidth="4" strokeLinecap="round" />
        <circle cx="72" cy="69" r="1.5" fill="#302620" />
        <path d="M46 79 48 65 58 65 61 80Z" fill={color} stroke="#694b3b" strokeWidth="1.5" />
        <circle cx="53" cy="57" r="8" fill="#e4b991" stroke="#76513b" strokeWidth="1.5" />
        <path d="M45 55 49 47 60 47 62 55Z" fill="#c5a16b" stroke="#8d6436" strokeWidth="1.5" />
      </> : <>
        <path d="M41 91 46 76H66L71 91V113H41Z" fill={color} stroke="#6b4438" strokeWidth="2" />
        <path d="M41 96 31 113M71 96l10 17" stroke="#745442" strokeWidth="6" strokeLinecap="round" />
        <path d="M46 77V69M66 77V69" stroke="#d9af89" strokeWidth="4" strokeLinecap="round" />
        <circle cx="56" cy="60" r="13" fill="#e4b991" stroke="#76513b" strokeWidth="1.7" />
        <path d="M43 56Q45 42 56 44Q69 42 69 56Q62 50 56 51Q50 50 43 56" fill="#463e32" />
        <path d="M51 62h1m8 0h1" stroke="#45372a" strokeWidth="2" strokeLinecap="round" />
        {rank === 'R' ? <>
          <path d="M44 48 42 34 49 40 56 32 63 40 70 34 68 48Z" fill="#dfb95c" stroke="#9c7427" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="49" cy="44" r="2" fill="#af3d38" /><circle cx="63" cy="44" r="2" fill="#af3d38" />
          <path d="M49 67Q56 80 63 67" stroke="#52402e" strokeWidth="4" strokeLinecap="round" />
        </> : <path d="M42 48Q56 36 70 48l-5-13-9 5-9-5Z" fill="#c5a16b" stroke="#8d6436" strokeWidth="2" />}
      </>}
    </g>
  )
}

export function ItalianCardFront({ rank, suit }: Props) {
  const color = italianSuitColors[suit]
  const pips = pipPositions[rank]
  const isCourt = rank in figureNames
  return (
    <div className="card-face h-full w-full overflow-hidden rounded-lg select-none">
      <svg viewBox="0 0 112 160" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${rank} di ${italianSuitNames[suit].toLowerCase()}`}>
        <rect x="2" y="2" width="108" height="156" rx="6" fill="none" stroke={color} strokeWidth="2" />
        <rect x="6" y="6" width="100" height="148" rx="3" fill="none" stroke={color} strokeWidth="0.8" opacity="0.7" />
        <g fill={color} textAnchor="middle" fontFamily="Georgia, serif" fontWeight="bold">
          <text x="16" y="21" fontSize="17">{rank}</text>
          <text x="16" y="21" fontSize="17" transform="rotate(180 56 80)">{rank}</text>
        </g>
        <svg x="10" y="25" width="12" height="12"><ItalianSuitIcon suit={suit} /></svg>
        <svg x="90" y="123" width="12" height="12"><ItalianSuitIcon suit={suit} /></svg>
        {rank === 'A' && <>
          <path d="M24 78 Q56 19 88 78Q56 139 24 78Z" fill="none" stroke={color} strokeWidth="1.2" opacity="0.4" />
          <path d="M31 78h50M56 44v68" stroke={color} strokeWidth="0.7" opacity="0.4" />
          <svg x="29" y="50" width="54" height="54"><ItalianSuitIcon suit={suit}/></svg>
          <text x="56" y="116" textAnchor="middle" fontSize="8" fill={color} fontWeight="bold" letterSpacing="2">ASSO</text>
        </>}
        {pips?.map(([x, y], index) => (
          <svg key={index} x={x - (rank === '7' ? 11 : 14)} y={y - (rank === '7' ? 11 : 14)} width={rank === '7' ? 22 : 28} height={rank === '7' ? 22 : 28}><ItalianSuitIcon suit={suit}/></svg>
        ))}
        {isCourt && <>
          <CourtFigure rank={rank} suit={suit} />
          <rect x="29" y="111" width="54" height="13" rx="2" fill="#faf3e3" stroke={color} strokeWidth="1" />
          <text x="56" y="121" textAnchor="middle" fontSize="9" fill={color} fontFamily="Georgia,serif" fontWeight="bold" letterSpacing="1">{figureNames[rank]}</text>
        </>}
        <text x="56" y="143" textAnchor="middle" fontFamily="Georgia,serif" fontSize="8" fill={color} fontWeight="bold" letterSpacing="1.3">{italianSuitNames[suit]}</text>
      </svg>
    </div>
  )
}
