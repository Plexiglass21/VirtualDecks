import { CardBack } from '../card/CardBack'
import { CardFront } from '../card/CardFront'
import type { Zone } from '../../types/zone'

type ZoneViewProps = {
  zone: Zone
  onOpen: () => void
}

export function ZoneView({
  zone,
  onOpen,
}: ZoneViewProps) {
  const topCard = zone.cards[zone.cards.length - 1]
  const edgeCount = Math.min(3, Math.max(0, zone.cards.length - 1))
  const count = zone.cards.length

  return (
    <div className="relative h-40 w-28">
      {topCard ? (
        <button
          type="button"
          onClick={onOpen}
          className="group relative block h-full w-full cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
          aria-label={`${zone.label}, ${count} cards. Click to look through it.`}
        >
          {Array.from({ length: edgeCount }, (_, index) => {
            const offset = (edgeCount - index) * 1.5

            return (
              <div
                key={index}
                className="card-edge absolute inset-0 rounded-lg"
                style={{ transform: `translate(${offset}px, ${offset}px)` }}
              />
            )
          })}

          <div className="absolute inset-0 transition-transform duration-150 ease-out group-hover:-translate-y-1">
            {topCard.faceUp ? (
              <CardFront rank={topCard.rank} suit={topCard.suit} />
            ) : (
              <CardBack />
            )}
          </div>
        </button>
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-ivory/25 px-4 text-center text-xs leading-relaxed text-ivory/45">
          Drop cards here
        </div>
      )}

      <div className="pointer-events-none absolute top-full left-0 mt-4 whitespace-nowrap">
        <p className="text-sm font-medium text-ivory/90">{zone.label}</p>
        <p className="mt-0.5 text-xs text-ivory/50 tabular-nums">
          {count === 0 ? 'Empty' : `${count} ${count === 1 ? 'card' : 'cards'}`}
        </p>
      </div>
    </div>
  )
}
