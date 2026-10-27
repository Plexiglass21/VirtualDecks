import { isRedSuit } from '../../utils/suits'
import { SuitIcon } from './SuitIcon'

type CardFrontProps = {
  rank: string
  suit: string
}

// Pip positions inside the pip area: [column, row], both 0..1.
// Rows past the middle are drawn upside down, like on a printed deck.
const L = 0
const M = 0.5
const R = 1

const pipLayouts: Record<string, Array<[number, number]>> = {
  '2': [[M, 0], [M, 1]],
  '3': [[M, 0], [M, 0.5], [M, 1]],
  '4': [[L, 0], [R, 0], [L, 1], [R, 1]],
  '5': [[L, 0], [R, 0], [M, 0.5], [L, 1], [R, 1]],
  '6': [[L, 0], [R, 0], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  '7': [[L, 0], [R, 0], [M, 0.25], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  '8': [[L, 0], [R, 0], [M, 0.25], [L, 0.5], [R, 0.5], [M, 0.75], [L, 1], [R, 1]],
  '9': [[L, 0], [R, 0], [L, 1 / 3], [R, 1 / 3], [M, 0.5], [L, 2 / 3], [R, 2 / 3], [L, 1], [R, 1]],
  '10': [[L, 0], [R, 0], [M, 1 / 6], [L, 1 / 3], [R, 1 / 3], [L, 2 / 3], [R, 2 / 3], [M, 5 / 6], [L, 1], [R, 1]],
}

function CornerIndex({ rank, suit, className = '' }: CardFrontProps & { className?: string }) {
  return (
    <div className={`absolute flex w-[15cqw] flex-col items-center ${className}`}>
      <span
        className={`font-display text-[17cqw] leading-[0.95] font-semibold lining-nums ${
          rank === '10' ? 'tracking-[-0.09em]' : ''
        }`}
      >
        {rank}
      </span>
      <SuitIcon suit={suit} className="mt-[1.5cqw] w-[9.5cqw]" />
    </div>
  )
}

function Pips({ rank, suit }: CardFrontProps) {
  const layout = pipLayouts[rank] ?? []

  return (
    <div className="absolute inset-x-[30%] inset-y-[14%]">
      {layout.map(([column, row], index) => (
        <SuitIcon
          key={index}
          suit={suit}
          className={`absolute w-[15cqw] -translate-x-1/2 -translate-y-1/2 ${row > 0.5 ? 'rotate-180' : ''}`}
          style={{ left: `${column * 100}%`, top: `${row * 100}%` }}
        />
      ))}
    </div>
  )
}

function CourtPanel({ rank, suit }: CardFrontProps) {
  const isRed = isRedSuit(suit)
  const half = (
    <div className="flex flex-1 items-center justify-center gap-[2cqw]">
      <span className="font-display text-[30cqw] leading-none font-semibold">{rank}</span>
      <SuitIcon suit={suit} className="w-[12cqw]" />
    </div>
  )

  return (
    <div
      className={`absolute inset-x-[25%] inset-y-[13%] flex flex-col rounded-[1.5cqw] border ${
        isRed
          ? 'border-suit-red/30 bg-suit-red/6'
          : 'border-suit-black/25 bg-suit-black/4'
      }`}
    >
      {half}
      <div className={`mx-[12%] h-px ${isRed ? 'bg-suit-red/30' : 'bg-suit-black/25'}`} />
      <div className="flex flex-1 rotate-180">{half}</div>
    </div>
  )
}

export function CardFront({ rank, suit }: CardFrontProps) {
  const colorClass = isRedSuit(suit) ? 'text-suit-red' : 'text-suit-black'

  return (
    <div className={`card-face @container relative h-full w-full overflow-hidden rounded-lg select-none ${colorClass}`}>
      <CornerIndex rank={rank} suit={suit} className="top-[4.5%] left-[4%]" />

      {rank === 'A' && (
        <SuitIcon
          suit={suit}
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${
            suit === '♠' ? 'w-[42cqw]' : 'w-[34cqw]'
          }`}
        />
      )}

      {['J', 'Q', 'K'].includes(rank) && <CourtPanel rank={rank} suit={suit} />}

      {pipLayouts[rank] && <Pips rank={rank} suit={suit} />}

      <CornerIndex rank={rank} suit={suit} className="right-[4%] bottom-[4.5%] rotate-180" />
    </div>
  )
}
