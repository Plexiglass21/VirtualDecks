import { useLayoutEffect, type RefObject } from 'react'
import { motion, useMotionValue } from 'motion/react'
import type { ElementSize } from '../../hooks/useElementSize'
import type { Pile } from '../../types/pile'
import type { NormalizedPosition } from '../../types/position'
import { CardBack } from '../card/CardBack'
import { CardFront } from '../card/CardFront'
import { CountBadge } from '../shared/CountBadge'

type PileViewProps = {
  pile: Pile
  dragConstraintsRef: RefObject<HTMLElement | null>
  tableSize: ElementSize
  onPositionCommit: (position: NormalizedPosition) => void
  onDragStart: () => void
  onOpen: () => void
}

export function PileView({
  pile,
  dragConstraintsRef,
  tableSize,
  onPositionCommit,
  onDragStart,
  onOpen,
}: PileViewProps) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const topCard = pile.cards[pile.cards.length - 1]
  const edgeCount = Math.min(3, pile.cards.length - 1)

  useLayoutEffect(() => {
    if (tableSize.width === 0 || tableSize.height === 0) return

    x.set((pile.position.x - 0.5) * tableSize.width)
    y.set((pile.position.y - 0.5) * tableSize.height)
  }, [pile.position.x, pile.position.y, tableSize, x, y])

  function handleDragEnd() {
    if (tableSize.width === 0 || tableSize.height === 0) return

    onPositionCommit({
      x: Math.min(1, Math.max(0, x.get() / tableSize.width + 0.5)),
      y: Math.min(1, Math.max(0, y.get() / tableSize.height + 0.5)),
    })
  }

  return (
    <motion.article
      drag
      dragConstraints={dragConstraintsRef}
      dragElastic={0}
      dragMomentum={false}
      whileDrag={{ scale: 1.04 }}
      onDragStart={onDragStart}
      onDragEnd={handleDragEnd}
      onTap={onOpen}
      style={{ x, y, zIndex: pile.zIndex }}
      className="group absolute top-1/2 left-1/2 h-40 w-28 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none active:cursor-grabbing"
      aria-label={`Pile of ${pile.cards.length} cards. Click to look through it.`}
    >
      {Array.from({ length: edgeCount }, (_, index) => {
        const offset = (edgeCount - index) * 2

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

      <CountBadge count={pile.cards.length} />
    </motion.article>
  )
}
