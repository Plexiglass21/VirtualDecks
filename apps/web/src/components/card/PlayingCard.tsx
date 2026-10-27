import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { animate, motion, useMotionValue } from 'motion/react'
import type { ElementSize } from '../../hooks/useElementSize'
import type { NormalizedPosition } from '../../types/position'
import { CardBack } from './CardBack'
import { CardFront } from './CardFront'

type PlayingCardProps = {
  rank: string
  suit: string
  dragConstraintsRef: RefObject<HTMLElement | null>
  tableSize: ElementSize
  position: NormalizedPosition
  spawnPosition?: NormalizedPosition
  zIndex: number
  faceUp: boolean
  selected: boolean
  onPositionCommit: (position: NormalizedPosition) => void
  onDragStart: () => void
  onDragMove: (delta: NormalizedPosition) => void
  onFlip: () => void
  onSelect: (additive: boolean) => void
  onSelectOnly: () => void
}

const restingShadow = '0 0px 0px rgba(0, 0, 0, 0)'
const liftedShadow = '0 22px 34px rgba(0, 0, 0, 0.42)'

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function isAdditive(event: { shiftKey: boolean, ctrlKey: boolean, metaKey: boolean }) {
  return event.shiftKey || event.ctrlKey || event.metaKey
}

// Small, stable tilt per card so the table doesn't look like a spreadsheet.
function getCardTilt(rank: string, suit: string) {
  const code = `${rank}${suit}`
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0)

  return ((code % 9) - 4) * 0.9
}

export function PlayingCard({
  rank,
  suit,
  dragConstraintsRef,
  tableSize,
  position,
  spawnPosition,
  zIndex,
  faceUp,
  selected,
  onPositionCommit,
  onDragStart,
  onDragMove,
  onFlip,
  onSelect,
  onSelectOnly,
}: PlayingCardProps) {
  const hasSpawned = useRef(false)
  const lastDragPoint = useRef({ x: 0, y: 0 })

  // x/y are pixel offsets of the card's centre from the table's centre.
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const tilt = useMemo(() => getCardTilt(rank, suit), [rank, suit])

  useLayoutEffect(() => {
    const { width, height } = tableSize

    if (width === 0 || height === 0) return

    const targetX = (position.x - 0.5) * width
    const targetY = (position.y - 0.5) * height

    if (!hasSpawned.current && spawnPosition) {
      x.set((spawnPosition.x - 0.5) * width)
      y.set((spawnPosition.y - 0.5) * height)

      const transition = { type: 'spring', stiffness: 260, damping: 28 } as const
      animate(x, targetX, transition)
      animate(y, targetY, transition)
    } else {
      x.set(targetX)
      y.set(targetY)
    }

    hasSpawned.current = true
  }, [
    position.x,
    position.y,
    tableSize,
    x,
    y,
    spawnPosition,
  ])

  function handleDragStart() {
    lastDragPoint.current = { x: x.get(), y: y.get() }
    onDragStart()
  }

  function handleDrag() {
    const { width, height } = tableSize

    if (width === 0 || height === 0) return

    // Use the card's real movement (already clamped to the table), not the pointer's.
    const currentX = x.get()
    const currentY = y.get()

    onDragMove({
      x: (currentX - lastDragPoint.current.x) / width,
      y: (currentY - lastDragPoint.current.y) / height,
    })

    lastDragPoint.current = { x: currentX, y: currentY }
  }

  function handleDragEnd() {
    const { width, height } = tableSize

    if (width === 0 || height === 0) return

    onPositionCommit({
      x: clamp01(x.get() / width + 0.5),
      y: clamp01(y.get() / height + 0.5),
    })
  }

  return (
    <motion.article
      drag
      dragConstraints={dragConstraintsRef}
      dragElastic={0}
      dragMomentum={false}
      whileDrag={{ scale: 1.06, rotate: 0, boxShadow: liftedShadow }}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      onPointerDown={(event) => onSelect(isAdditive(event))}
      onTap={(event) => {
        if (!isAdditive(event)) onSelectOnly()
      }}
      onDoubleClick={onFlip}
      style={{ x, y, zIndex, rotate: tilt, boxShadow: restingShadow }}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      aria-label={faceUp ? `${rank} of ${suit}` : 'Face-down card'}
      aria-pressed={selected}
      className={`group absolute top-1/2 left-1/2 h-40 w-28 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-lg select-none active:cursor-grabbing ${
        selected ? 'outline-2 outline-offset-[3px] outline-gold' : ''
      }`}
    >
      <div className="h-full w-full transition-transform duration-150 ease-out [perspective:900px] group-hover:-translate-y-1">
        <motion.div
          className="relative h-full w-full"
          initial={false}
          animate={{ rotateY: faceUp ? 0 : 180 }}
          transition={{ duration: 0.4, ease: [0.3, 0.7, 0.2, 1] }}
          style={{ transformStyle: 'preserve-3d' }}
        >
          <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
            <CardFront rank={rank} suit={suit} />
          </div>

          <div
            className="absolute inset-0"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <CardBack />
          </div>
        </motion.div>
      </div>
    </motion.article>
  )
}
