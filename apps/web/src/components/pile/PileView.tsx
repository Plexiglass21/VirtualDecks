import { useLayoutEffect, useRef, type RefObject } from 'react'
import { motion, useDragControls, useMotionValue } from 'motion/react'
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

  const dragControls = useDragControls()
  const didDrag = useRef(false)
  const pressStart = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const touchDrag = useRef<{
    pointerId: number; startX: number; startY: number
    motionX: number; motionY: number; moved: boolean
  } | null>(null)

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
      role="button"
      tabIndex={0}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen() } }}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={dragConstraintsRef}
      dragElastic={0}
      dragMomentum={false}
      whileDrag={{ scale: 1.04 }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        didDrag.current = false
        pressStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
          event.currentTarget.setPointerCapture(event.pointerId)
          touchDrag.current = {
            pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
            motionX: x.get(), motionY: y.get(), moved: false,
          }
        } else {
          dragControls.start(event.nativeEvent, { distanceThreshold: 8 })
        }
      }}
      onPointerMove={(event) => {
        const gesture = touchDrag.current
        if (!gesture || gesture.pointerId !== event.pointerId) return
        const dx = event.clientX - gesture.startX
        const dy = event.clientY - gesture.startY
        if (!gesture.moved && Math.hypot(dx, dy) < 9) return
        gesture.moved = true
        didDrag.current = true
        x.set(gesture.motionX + dx)
        y.set(gesture.motionY + dy)
      }}
      onPointerUp={(event) => {
        const start = pressStart.current
        pressStart.current = null
        const gesture = touchDrag.current
        if (gesture?.pointerId === event.pointerId) {
          touchDrag.current = null
          if (gesture.moved) {
            if (tableSize.width > 0 && tableSize.height > 0) {
              onPositionCommit({
                x: Math.min(1, Math.max(0, (gesture.motionX + event.clientX - gesture.startX) / tableSize.width + 0.5)),
                y: Math.min(1, Math.max(0, (gesture.motionY + event.clientY - gesture.startY) / tableSize.height + 0.5)),
              })
            }
            return
          }
        }
        if (didDrag.current || !start || start.pointerId !== event.pointerId) return
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 18) onOpen()
      }}
      onPointerCancel={() => {
        pressStart.current = null
        if (touchDrag.current) {
          x.set(touchDrag.current.motionX)
          y.set(touchDrag.current.motionY)
        }
        touchDrag.current = null
      }}
      onDragStart={() => {
        didDrag.current = true
        onDragStart()
      }}
      onDragEnd={handleDragEnd}
      style={{ x, y, zIndex: pile.zIndex, rotate: pile.rotation }}
      className="group table-card absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-gold"
      aria-label={`Pile of ${pile.cards.length} cards. Tap to view actions.`}
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
        {topCard.faceUp && topCard.rank && topCard.suit ? (
          <CardFront rank={topCard.rank} suit={topCard.suit} />
        ) : (
          <CardBack />
        )}
      </div>

      <CountBadge count={pile.cards.length} />
    </motion.article>
  )
}
