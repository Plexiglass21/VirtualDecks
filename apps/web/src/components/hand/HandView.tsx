import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { motion, useDragControls } from 'motion/react'
import type { Hand } from '../../types/hand'
import type { NormalizedPosition } from '../../types/position'
import { CardBack } from '../card/CardBack'
import { CardFront } from '../card/CardFront'

type HandViewProps = {
  hand: Hand
  tableRef: RefObject<HTMLElement | null>
  onDropCard: (cardId: string, position: NormalizedPosition) => void
  selectedCardIds: string[]
  onToggleCardSelection: (cardId: string) => void
}

type HandCardProps = {
  card: Hand['cards'][number]
  index: number
  selected: boolean
  rotate: number
  arc: number
  desktopOverlap: number
  tableRef: RefObject<HTMLElement | null>
  onToggle: () => void
  onDrop: (position: NormalizedPosition) => void
}

function HandCard({ card, index, selected, rotate, arc, desktopOverlap, tableRef, onToggle, onDrop }: HandCardProps) {
  const controls = useDragControls()
  const press = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const didDrag = useRef(false)
  const touchDrag = useRef<{
    pointerId: number; startX: number; startY: number
    element: HTMLElement; moved: boolean
  } | null>(null)

  function dropAt(clientX: number, clientY: number) {
    const table = tableRef.current
    if (!table) return
    const rect = table.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top
    if (px < 0 || px > rect.width || py < 0 || py > rect.height) return
    onDrop({ x: Math.min(1, Math.max(0, px / rect.width)), y: Math.min(1, Math.max(0, py / rect.height)) })
  }

  return (
    <motion.div
      role="button"
      tabIndex={0}
      onContextMenu={(event) => event.preventDefault()}
      drag
      dragControls={controls}
      dragListener={false}
      dragSnapToOrigin
      dragMomentum={false}
      onDragStart={() => { didDrag.current = true }}
      whileDrag={{ scale: 1.06, zIndex: 300 }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        press.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
        didDrag.current = false
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
          event.currentTarget.setPointerCapture(event.pointerId)
          touchDrag.current = {
            pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
            element: event.currentTarget, moved: false,
          }
        } else {
          controls.start(event.nativeEvent, { distanceThreshold: 8 })
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
        gesture.element.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
      }}
      onPointerUp={(event) => {
        const start = press.current
        press.current = null
        const gesture = touchDrag.current
        if (gesture?.pointerId === event.pointerId) {
          touchDrag.current = null
          gesture.element.style.removeProperty('transform')
          if (gesture.moved) {
            dropAt(event.clientX, event.clientY)
            return
          }
        }
        if (!start || start.pointerId !== event.pointerId || didDrag.current) return
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 18) onToggle()
      }}
      onPointerCancel={() => {
        press.current = null
        if (touchDrag.current) touchDrag.current.element.style.removeProperty('transform')
        touchDrag.current = null
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle()
        }
      }}
      aria-label={`Select card ${card.rank ?? ''} ${card.suit ?? ''}`}
      aria-pressed={selected}
      className="hand-card shrink-0 cursor-grab touch-none focus-visible:outline-2 focus-visible:outline-gold active:cursor-grabbing"
      style={{
        zIndex: 100 + index,
        '--desktop-card-overlap': `${desktopOverlap}px`,
        '--mobile-card-overlap': '36px',
      } as CSSProperties}
      onDragEnd={(_, info) => dropAt(info.point.x, info.point.y)}
    >
      <motion.div
        className={`h-full w-full origin-bottom rounded-md ${selected ? 'outline-2 outline-offset-2 outline-gold' : ''}`}
        initial={false}
        animate={{ rotate, y: arc - (selected ? 14 : 0) }}
        whileHover={{ y: arc - (selected ? 20 : 16) }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      >
        {card.faceUp && card.rank && card.suit ? <CardFront rank={card.rank} suit={card.suit} /> : <CardBack />}
      </motion.div>
    </motion.div>
  )
}

export function HandView({ hand, tableRef, onDropCard, selectedCardIds, onToggleCardSelection }: HandViewProps) {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 639px), (pointer: coarse)').matches)
  const [startIndex, setStartIndex] = useState(0)
  const count = hand.cards.length
  const pageSize = compact ? 6 : 12
  const first = Math.min(startIndex, Math.max(0, count - pageSize))
  const visibleCards = hand.cards.slice(first, first + pageSize)
  const visibleCount = visibleCards.length
  const centerIndex = (visibleCount - 1) / 2
  const spread = Math.min(4, 22 / Math.max(visibleCount - 1, 1))
  const desktopOverlap = Math.min(64, 18 + visibleCount * 3)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px), (pointer: coarse)')
    const update = () => setCompact(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    setStartIndex((index) => Math.min(index, Math.max(0, count - pageSize)))
  }, [count, pageSize])

  if (count === 0) {
    return (
      <section aria-label="Your empty hand — drop cards here" className="hand-empty-target flex h-24 items-center justify-center rounded-xl border-2 border-dashed border-gold/55 bg-black/35 px-3 text-center shadow-[inset_0_0_22px_rgba(0,0,0,0.12)]">
        <p className="text-[11px] leading-snug font-medium text-ivory/80 sm:text-sm">
          Your hand <span className="text-gold">· 0 cards</span>
          <span className="mt-1 block text-[10px] font-normal text-ivory/60 sm:text-xs">Drop a card here to pick it up</span>
        </p>
      </section>
    )
  }

  return (
    <section aria-label={`Your hand, ${count} cards`} className="hand-fan relative flex h-36 flex-col justify-end sm:h-48">
      <p className="hand-status pointer-events-none absolute top-0 left-1/2 z-[350] -translate-x-1/2 whitespace-nowrap rounded-md bg-black/65 px-2 py-1 text-[10px] text-ivory/90 sm:text-[11px]">
        Your hand · {selectedCardIds.length} selected{count > pageSize ? ` · ${first + 1}–${first + visibleCount} of ${count}` : ''}
      </p>
      <div className="flex w-full min-w-0 flex-1 items-end justify-center px-3 pt-7 sm:px-10">
        {visibleCards.map((card, index) => {
          const offset = index - centerIndex
          const distance = centerIndex === 0 ? 0 : offset / centerIndex
          const rotate = offset * spread
          const arc = distance * distance * 12
          return (
            <HandCard
              key={card.id}
              card={card}
              index={index}
              selected={selectedCardIds.includes(card.id)}
              rotate={rotate}
              arc={arc}
              desktopOverlap={desktopOverlap}
              tableRef={tableRef}
              onToggle={() => onToggleCardSelection(card.id)}
              onDrop={(position) => onDropCard(card.id, position)}
            />
          )
        })}
      </div>
      {count > pageSize && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-[301] flex justify-between px-1 sm:bottom-12 sm:px-2">
          <button type="button" aria-label="Previous cards in your hand" disabled={first === 0} onClick={() => setStartIndex((index) => Math.max(0, index - pageSize))} className="pointer-events-auto flex h-10 w-9 items-center justify-center rounded-lg border border-ivory/15 bg-black/75 text-xl text-ivory disabled:opacity-30">‹</button>
          <button type="button" aria-label="Next cards in your hand" disabled={first + pageSize >= count} onClick={() => setStartIndex((index) => Math.min(Math.max(0, count - pageSize), index + pageSize))} className="pointer-events-auto flex h-10 w-9 items-center justify-center rounded-lg border border-ivory/15 bg-black/75 text-xl text-ivory disabled:opacity-30">›</button>
        </div>
      )}
    </section>
  )
}
