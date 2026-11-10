import { motion } from 'motion/react'
import type { TableCard } from '../../types/card'
import { CardBack } from './CardBack'
import { CardFront } from './CardFront'

type CardCollectionDialogProps = {
  title: string
  cards: TableCard[]
  onClose: () => void
  onExtractTopCard?: () => void
  onFlipPile?: () => void
  onRotatePile?: () => void
  onShufflePile?: () => void
}

export function CardCollectionDialog({
  title,
  cards,
  onClose,
  onExtractTopCard,
  onFlipPile,
  onRotatePile,
  onShufflePile,
}: CardCollectionDialogProps) {
  const count = cards.length

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 px-3 py-4 backdrop-blur-[3px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-title"
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="flex max-h-[calc(100dvh-2rem)] w-[min(880px,100%)] flex-col rounded-xl border border-white/10 bg-[#161816] shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 id="collection-title" className="font-display text-2xl leading-none font-semibold text-ivory sm:text-3xl">
              {title}
            </h2>
            <span className="text-sm text-ivory/50 tabular-nums">
              {count} {count === 1 ? 'card' : 'cards'}, bottom to top
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-ivory/60 transition-colors hover:bg-white/[0.06] hover:text-ivory focus-visible:outline-2 focus-visible:outline-gold"
          >
            <svg viewBox="0 0 14 14" aria-hidden="true" className="h-3.5 w-3.5">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6 sm:py-6">
          <ol className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-x-4 gap-y-5">
            {cards.map((card, index) => (
              <li key={`${card.id}-${index}`} className="flex flex-col items-center gap-2">
                <div className="aspect-[7/10] w-24">
                  {card.faceUp && card.rank && card.suit ? (
                    <CardFront rank={card.rank} suit={card.suit} />
                  ) : (
                    <CardBack />
                  )}
                </div>
                <span className="text-[11px] text-ivory/40 tabular-nums">
                  {index === count - 1 ? 'Top' : index + 1}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {(onExtractTopCard || onFlipPile || onRotatePile || onShufflePile) && count > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.07] px-4 py-4 sm:px-6">
            {onFlipPile && <button type="button" onClick={onFlipPile} className="rounded-md border border-white/15 px-3 py-2 text-sm text-ivory/80 hover:bg-white/10">Flip pile</button>}
            {onRotatePile && <button type="button" onClick={onRotatePile} className="rounded-md border border-white/15 px-3 py-2 text-sm text-ivory/80 hover:bg-white/10">Rotate 90°</button>}
            {onShufflePile && <button type="button" onClick={() => { onShufflePile(); onClose() }} className="rounded-md border border-white/15 px-3 py-2 text-sm text-ivory/80 hover:bg-white/10">Shuffle pile</button>}
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-md px-4 text-sm text-ivory/70 transition-colors hover:text-ivory"
            >
              Close
            </button>
            {onExtractTopCard && <button
              type="button"
              onClick={onExtractTopCard}
              className="h-9 rounded-md bg-ivory px-4 text-sm font-semibold text-ink transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Take the top card
            </button>}
          </div>
        )}
      </motion.div>
    </div>
  )
}
