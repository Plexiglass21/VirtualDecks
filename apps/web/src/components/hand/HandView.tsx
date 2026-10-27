import type { RefObject } from 'react'
import { motion } from 'motion/react'
import type { Hand } from '../../types/hand'
import type { NormalizedPosition } from '../../types/position'
import { CardBack } from '../card/CardBack'
import { CardFront } from '../card/CardFront'

type HandViewProps = {
  hand: Hand
  tableRef: RefObject<HTMLElement | null>
  onDropCard: (
    cardId: string,
    position: NormalizedPosition
  ) => void
}

export function HandView({
  hand,
  tableRef,
  onDropCard,
}: HandViewProps) {
  const count = hand.cards.length
  const centerIndex = (count - 1) / 2
  const spread = Math.min(4, 22 / Math.max(count - 1, 1))
  const overlap = Math.min(64, 18 + count * 3)

  if (count === 0) {
    return (
      <div className="flex h-28 items-center justify-center pb-6">
        <p className="rounded-full border border-dashed border-ivory/20 px-4 py-2 text-xs text-ivory/50">
          Your hand is empty. Shift-click the deck, or drag a card down here.
        </p>
      </div>
    )
  }

  return (
    <section aria-label={`Your hand, ${count} cards`} className="flex h-48 items-end justify-center">
      {hand.cards.map((card, index) => {
        const offsetFromCenter = index - centerIndex
        const distance = centerIndex === 0 ? 0 : offsetFromCenter / centerIndex
        const rotate = offsetFromCenter * spread
        const arc = distance * distance * 18

        return (
          <motion.div
            key={card.id}
            drag
            dragSnapToOrigin
            dragMomentum={false}
            whileDrag={{ scale: 1.06, zIndex: 300 }}
            className="h-40 w-28 shrink-0 cursor-grab touch-none active:cursor-grabbing"
            style={{
              zIndex: 100 + index,
              marginInline: -overlap / 2,
            }}
            onDragEnd={(_, info) => {
              const table = tableRef.current

              if (!table) return

              const tableRect = table.getBoundingClientRect()
              const dropX = info.point.x - tableRect.left
              const dropY = info.point.y - tableRect.top

              const isInsideTable =
                dropX >= 0 &&
                dropX <= tableRect.width &&
                dropY >= 0 &&
                dropY <= tableRect.height

              if (!isInsideTable) return

              onDropCard(card.id, {
                x: Math.min(1, Math.max(0, dropX / tableRect.width)),
                y: Math.min(1, Math.max(0, dropY / tableRect.height)),
              })
            }}
          >
            <motion.div
              className="h-full w-full origin-bottom"
              initial={false}
              animate={{ rotate, y: arc }}
              whileHover={{ y: arc - 22 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            >
              {card.faceUp ? (
                <CardFront rank={card.rank} suit={card.suit} />
              ) : (
                <CardBack />
              )}
            </motion.div>
          </motion.div>
        )
      })}
    </section>
  )
}
