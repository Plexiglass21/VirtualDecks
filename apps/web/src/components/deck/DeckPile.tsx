import { useRef, type MouseEvent } from 'react'
import { CardBack } from '../card/CardBack'

type DeckPileProps = {
  cardsRemaining: number
  isMoving: boolean
  onDraw: () => void
  onDrawToHand: () => void
}

export function DeckPile({
  cardsRemaining,
  isMoving,
  onDraw,
  onDrawToHand,
}: DeckPileProps) {
  const edgeCount = Math.min(4, Math.ceil(cardsRemaining / 12))
  const isEmpty = cardsRemaining === 0
  const touchStart = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const ignoreSyntheticClick = useRef(false)

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (isMoving || isEmpty) return

    if (event.shiftKey) {
      onDrawToHand()
      return
    }

    onDraw()
  }

  return (
    <div className="table-card relative">
      {isEmpty ? (
        <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-ivory/25 text-xs text-ivory/45">
          Empty
        </div>
      ) : (
        <button
          type="button"
          onClick={(event) => {
            // The touch pointerup already drew a card. A subsequent synthetic
            // click must not draw another. Every new pointerdown resets this
            // flag, so quick consecutive taps are NOT swallowed.
            if (ignoreSyntheticClick.current && event.detail !== 0) {
              ignoreSyntheticClick.current = false
              return
            }
            ignoreSyntheticClick.current = false
            handleClick(event)
          }}
          onPointerDown={(event) => {
            if (event.pointerType === 'touch' || event.pointerType === 'pen') {
              ignoreSyntheticClick.current = false
              touchStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
              event.currentTarget.setPointerCapture(event.pointerId)
            } else {
              ignoreSyntheticClick.current = false
            }
          }}
          onPointerUp={(event) => {
            const start = touchStart.current
            touchStart.current = null
            if (!start || start.pointerId !== event.pointerId || isMoving || isEmpty) return
            if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 18) return
            ignoreSyntheticClick.current = true
            onDraw()
          }}
          onPointerCancel={() => { touchStart.current = null; ignoreSyntheticClick.current = false }}
          onContextMenu={(event) => event.preventDefault()}
          className={`group relative block h-full w-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold ${
            isMoving
              ? 'cursor-move outline-2 outline-offset-4 outline-gold outline-dashed'
              : 'cursor-pointer'
          }`}
          aria-label={`Deck, ${cardsRemaining} cards. Tap to draw to the table; use the To hand button to add a card to your hand.`}
          title="Tap to draw to the table · use To hand to draw into your hand"
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

          <div className="absolute inset-0 transition-transform duration-150 ease-out group-hover:-translate-y-1 group-active:translate-y-0">
            <CardBack />
          </div>
        </button>
      )}

      <div className="game-deck-caption pointer-events-none absolute top-full left-0 mt-4 whitespace-nowrap">
        <p className="text-sm font-medium text-ivory/90">Deck</p>
        <p className="mt-0.5 text-xs text-ivory/50 tabular-nums">
          {isMoving
            ? 'Drop it where you want it'
            : isEmpty
              ? 'Reset the table to refill'
              : `${cardsRemaining} left · tap to draw`}
        </p>
      </div>
    </div>
  )
}
