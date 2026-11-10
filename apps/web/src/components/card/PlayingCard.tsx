import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { animate, motion, useDragControls, useMotionValue } from 'motion/react'
import type { ElementSize } from '../../hooks/useElementSize'
import type { NormalizedPosition } from '../../types/position'
import { CardBack } from './CardBack'
import { CardFront } from './CardFront'

type PlayingCardProps = {
  rank?: string
  suit?: string
  dragConstraintsRef: RefObject<HTMLElement | null>
  tableSize: ElementSize
  position: NormalizedPosition
  spawnPosition?: NormalizedPosition
  zIndex: number
  faceUp: boolean
  rotation: number
  selected: boolean
  multiSelectMode: boolean
  onEnterMultiSelect: () => void
  onPositionCommit: (position: NormalizedPosition) => void
  onDragStart: () => void
  onDragMove: (delta: NormalizedPosition) => void
  onFlip: () => void
  onSelect: (additive: boolean) => void
  onSelectOnly: () => void
}

const restingShadow = '0 0px 0px rgba(0, 0, 0, 0)'
const liftedShadow = '0 22px 34px rgba(0, 0, 0, 0.42)'
const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function getCardTilt(rank = '', suit = '') {
  const code = `${rank}${suit}`.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return ((code % 9) - 4) * 0.9
}

export function PlayingCard({
  rank, suit, dragConstraintsRef, tableSize, position, spawnPosition, zIndex,
  faceUp, rotation, selected, multiSelectMode, onEnterMultiSelect,
  onPositionCommit, onDragStart, onDragMove, onFlip, onSelect, onSelectOnly,
}: PlayingCardProps) {
  const hasSpawned = useRef(false)
  const lastDragPoint = useRef({ x: 0, y: 0 })
  const dragControls = useDragControls()
  const longPressTimer = useRef<number | null>(null)
  const pressStart = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const didLongPress = useRef(false)
  const didDrag = useRef(false)
  const lastPointerType = useRef('mouse')
  // Touch dragging is driven by captured Pointer Events rather than a Motion
  // pan recognizer. This prevents Chrome Android from cancelling/losing the
  // gesture while retaining the established Motion drag behaviour for mouse.
  const touchDrag = useRef<{
    pointerId: number
    startX: number
    startY: number
    motionX: number
    motionY: number
    lastOffsetX: number
    lastOffsetY: number
    moved: boolean
  } | null>(null)

  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const tilt = useMemo(() => getCardTilt(rank, suit), [rank, suit])

  function cancelLongPress() {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current)
    longPressTimer.current = null
  }
  useEffect(() => () => cancelLongPress(), [])

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
  }, [position.x, position.y, tableSize, x, y, spawnPosition])

  function handleDragStart() {
    cancelLongPress()
    didDrag.current = true
    lastDragPoint.current = { x: x.get(), y: y.get() }
    onDragStart()
  }

  function handleDrag() {
    const { width, height } = tableSize
    if (!width || !height) return
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
    if (!width || !height) return
    onPositionCommit({ x: clamp01(x.get() / width + 0.5), y: clamp01(y.get() / height + 0.5) })
  }

  function handleSelect(additive: boolean) {
    if (additive) onSelect(true)
    else onSelectOnly()
  }

  return (
    <motion.article
      role="button"
      tabIndex={0}
      onContextMenu={(event) => event.preventDefault()}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={dragConstraintsRef}
      dragElastic={0}
      dragMomentum={false}
      whileDrag={{ scale: 1.06, boxShadow: liftedShadow }}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        lastPointerType.current = event.pointerType
        didDrag.current = false
        didLongPress.current = false
        pressStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
        cancelLongPress()
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
          // Keep the full gesture directed to the card even if the finger
          // travels past its bounds. Capture is lost automatically on release.
          event.currentTarget.setPointerCapture(event.pointerId)
          touchDrag.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            motionX: x.get(),
            motionY: y.get(),
            lastOffsetX: 0,
            lastOffsetY: 0,
            moved: false,
          }
          longPressTimer.current = window.setTimeout(() => {
            const gesture = touchDrag.current
            if (!gesture || gesture.moved) return
            didLongPress.current = true
            if (!multiSelectMode) onEnterMultiSelect()
            onSelect(true)
          }, 550)
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
        if (!gesture.moved) {
          gesture.moved = true
          didDrag.current = true
          cancelLongPress()
        }
        // The dragged card follows the finger without waiting for a server
        // update. The server receives just one final position on pointerup.
        x.set(gesture.motionX + dx)
        y.set(gesture.motionY + dy)
        if (tableSize.width > 0 && tableSize.height > 0) {
          onDragMove({
            x: (dx - gesture.lastOffsetX) / tableSize.width,
            y: (dy - gesture.lastOffsetY) / tableSize.height,
          })
        }
        gesture.lastOffsetX = dx
        gesture.lastOffsetY = dy
      }}
      onPointerUp={(event) => {
        cancelLongPress()
        const start = pressStart.current
        pressStart.current = null
        const gesture = touchDrag.current
        if (gesture?.pointerId === event.pointerId) {
          touchDrag.current = null
          if (gesture.moved) {
            if (tableSize.width > 0 && tableSize.height > 0) {
              const dx = event.clientX - gesture.startX
              const dy = event.clientY - gesture.startY
              // Include final movement between the last move and pointerup,
              // otherwise other selected cards can lag behind the dropped one.
              onDragMove({
                x: (dx - gesture.lastOffsetX) / tableSize.width,
                y: (dy - gesture.lastOffsetY) / tableSize.height,
              })
              x.set(gesture.motionX + dx)
              y.set(gesture.motionY + dy)
              onPositionCommit({
                x: clamp01((gesture.motionX + dx) / tableSize.width + 0.5),
                y: clamp01((gesture.motionY + dy) / tableSize.height + 0.5),
              })
            }
            return
          }
        }
        if (!start || start.pointerId !== event.pointerId || didDrag.current || didLongPress.current) return
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 18) return
        if (selected && !multiSelectMode) onSelect(true)
        else handleSelect(multiSelectMode || event.shiftKey || event.ctrlKey || event.metaKey)
      }}
      onPointerCancel={() => {
        cancelLongPress()
        pressStart.current = null
        const gesture = touchDrag.current
        if (gesture?.moved && tableSize.width > 0 && tableSize.height > 0) {
          onDragMove({ x: -gesture.lastOffsetX / tableSize.width, y: -gesture.lastOffsetY / tableSize.height })
          x.set(gesture.motionX)
          y.set(gesture.motionY)
        }
        touchDrag.current = null
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleSelect(multiSelectMode || event.shiftKey || event.ctrlKey || event.metaKey)
        }
      }}
      onDoubleClick={() => { if (lastPointerType.current === 'mouse') onFlip() }}
      style={{ x, y, zIndex, rotate: rotation + tilt, boxShadow: restingShadow }}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      aria-label={faceUp && rank && suit ? `${rank} of ${suit}. Select card.` : 'Face-down card. Select card.'}
      aria-pressed={selected}
      className={`group table-card absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-lg select-none active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold ${selected ? 'outline-2 outline-offset-[3px] outline-gold' : ''}`}
    >
      <div className="h-full w-full transition-transform duration-150 ease-out [perspective:900px] group-hover:-translate-y-1">
        <motion.div
          className="relative h-full w-full"
          initial={false}
          animate={{ rotateY: faceUp && rank && suit ? 0 : 180 }}
          transition={{ duration: 0.4, ease: [0.3, 0.7, 0.2, 1] }}
          style={{ transformStyle: 'preserve-3d' }}
        >
          <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
            {rank && suit ? <CardFront rank={rank} suit={suit} /> : <CardBack />}
          </div>
          <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
            <CardBack />
          </div>
        </motion.div>
      </div>
    </motion.article>
  )
}
