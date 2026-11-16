import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { motion, useDragControls } from 'motion/react'
import { createPortal } from 'react-dom'
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
  onDragActiveChange?: (active: boolean) => void
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
  onDragActiveChange: (active: boolean) => void
}

function HandCard({ card, index, selected, rotate, arc, desktopOverlap, tableRef, onToggle, onDrop, onDragActiveChange }: HandCardProps) {
  const controls = useDragControls()
  const press = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const didDrag = useRef(false)
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null)
  const touchDrag = useRef<{
    pointerId: number; startX: number; startY: number
    element: HTMLElement; moved: boolean; scrolling: boolean
    scrollContainer: HTMLElement | null; scrollStart: number
  } | null>(null)

  function dropAt(clientX: number, clientY: number) {
    const table = tableRef.current
    if (!table) return
    // Ignore releases above controls: they are not part of the felt target.
    const hovered = document.elementFromPoint(clientX, clientY)
    if (hovered?.closest('.game-touch-actions, .game-header, [role="dialog"]')) return
    const rect = table.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top
    if (px < 0 || px > rect.width || py < 0 || py > rect.height) return
    onDrop({ x: Math.min(1, Math.max(0, px / rect.width)), y: Math.min(1, Math.max(0, py / rect.height)) })
  }

  return (
    <>
    <motion.div
      role="button"
      tabIndex={0}
      onContextMenu={(event) => event.preventDefault()}
      drag
      dragControls={controls}
      dragListener={false}
      dragSnapToOrigin
      dragMomentum={false}
      onDragStart={() => { didDrag.current = true; onDragActiveChange(true) }}
      onDragEnd={(_, info) => { onDragActiveChange(false); dropAt(info.point.x, info.point.y) }}
      whileDrag={{ scale: 1.06, zIndex: 300 }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        press.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
        didDrag.current = false
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
          event.currentTarget.setPointerCapture(event.pointerId)
          touchDrag.current = {
            pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
            element: event.currentTarget, moved: false, scrolling: false,
            scrollContainer: event.currentTarget.closest<HTMLElement>('.hand-scroll-touch'),
            scrollStart: event.currentTarget.closest<HTMLElement>('.hand-scroll-touch')?.scrollLeft ?? 0,
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
        if (!gesture.moved && Math.hypot(dx, dy) < 11) return
        if (!gesture.moved) {
          gesture.moved = true
          didDrag.current = true
          // Horizontal swipes scroll the entire hand; vertical gestures
          // instead drag an individual card onto the table or discard pile.
          gesture.scrolling = Boolean(gesture.scrollContainer) && Math.abs(dx) > Math.abs(dy) * 1.2
          if (!gesture.scrolling) onDragActiveChange(true)
        }
        if (gesture.scrolling) {
          if (gesture.scrollContainer) gesture.scrollContainer.scrollLeft = gesture.scrollStart - dx
          return
        }
        // The scroll container clips overflow, so a portal follows the finger
        // outside the hand without blocking table drop targets.
        setDragPreview({ x: event.clientX, y: event.clientY })
      }}
      onPointerUp={(event) => {
        const start = press.current
        press.current = null
        const gesture = touchDrag.current
        if (gesture?.pointerId === event.pointerId) {
          touchDrag.current = null
          setDragPreview(null)
          if (gesture.moved) {
            if (!gesture.scrolling) {
              onDragActiveChange(false)
              dropAt(event.clientX, event.clientY)
            }
            return
          }
        }
        if (!start || start.pointerId !== event.pointerId || didDrag.current) return
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 18) onToggle()
      }}
      onPointerCancel={() => {
        press.current = null
        setDragPreview(null)
        touchDrag.current = null
        onDragActiveChange(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle()
        }
      }}
      aria-label={`Seleziona carta ${card.rank ?? ''} ${card.suit ?? ''}`}
      aria-pressed={selected}
      className="hand-card shrink-0 cursor-grab touch-none focus-visible:outline-2 focus-visible:outline-gold active:cursor-grabbing"
      style={{
        zIndex: 100 + index,
        '--desktop-card-overlap': `${desktopOverlap}px`,
        '--mobile-card-overlap': '18px',
      } as CSSProperties}
    >
      <motion.div
        className={`h-full w-full origin-bottom rounded-md ${selected ? 'outline-2 outline-offset-2 outline-gold' : ''}`}
        initial={false}
        animate={{ rotate, y: arc - (selected ? 14 : 0) }}
        whileHover={{ y: arc - (selected ? 20 : 12) }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      >
        {card.faceUp && card.rank && card.suit ? <CardFront rank={card.rank} suit={card.suit} /> : <CardBack />}
      </motion.div>
    </motion.div>
    {dragPreview && createPortal(
      <div aria-hidden="true" className="mobile-drag-preview" style={{ left: dragPreview.x, top: dragPreview.y }}>
        {card.faceUp && card.rank && card.suit ? <CardFront rank={card.rank} suit={card.suit} /> : <CardBack />}
      </div>, document.body
    )}
    </>
  )
}

export function HandView({ hand, tableRef, onDropCard, selectedCardIds, onToggleCardSelection, onDragActiveChange = () => {} }: HandViewProps) {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 639px), (pointer: coarse)').matches)
  const [startIndex, setStartIndex] = useState(0)
  const count = hand.cards.length
  // Render all cards on touch devices in one scrollable strip. The
  // desktop's original 12-card paging and curved fan remain unchanged.
  const pageSize = compact ? count : 12
  const first = compact ? 0 : Math.min(startIndex, Math.max(0, count - pageSize))
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
      <section aria-label="La tua mano è vuota: rilascia le carte qui" className="hand-empty-target flex h-24 items-center justify-center rounded-xl border-2 border-dashed border-gold/55 bg-black/35 px-3 text-center shadow-[inset_0_0_22px_rgba(0,0,0,0.12)]">
        <p className="text-[11px] leading-snug font-medium text-ivory/80 sm:text-sm">
          La tua mano <span className="text-gold">· 0 carte</span>
          <span className="mt-1 block text-[10px] font-normal text-ivory/60 sm:text-xs">Rilascia qui una carta per prenderla</span>
        </p>
      </section>
    )
  }

  return (
    <section aria-label={`La tua mano, ${count} carte`} className="hand-fan relative flex h-34 flex-col justify-end sm:h-48">
      <p className="hand-status pointer-events-none absolute top-0 left-1/2 z-[350] -translate-x-1/2 whitespace-nowrap rounded-md bg-black/65 px-2 py-1 text-[10px] text-ivory/90 sm:text-[11px]">
        La tua mano · {count} carte · {selectedCardIds.length} selezionate{!compact && count > pageSize ? ` · ${first + 1}–${first + visibleCount} di ${count}` : ''}
      </p>
      <div className={`hand-scroll flex w-full min-w-0 flex-1 items-end px-3 pt-7 sm:px-10 ${compact ? 'hand-scroll-touch justify-start overflow-x-auto overscroll-x-contain' : 'justify-center'}`}>
        <div className={`hand-card-track flex h-full items-end ${compact ? 'min-w-max px-2' : 'w-full justify-center'}`}>
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
              onDragActiveChange={onDragActiveChange}
            />
          )
        })}
        </div>
      </div>
      {compact && count > 4 && <span className="hand-scroll-hint pointer-events-none absolute right-1 bottom-0 text-[9px] text-gold/80">Scorri ↔</span>}
      {!compact && count > pageSize && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-[301] flex justify-between px-1 sm:bottom-12 sm:px-2">
          <button type="button" aria-label="Carte precedenti nella tua mano" disabled={first === 0} onClick={() => setStartIndex((index) => Math.max(0, index - pageSize))} className="pointer-events-auto flex h-10 w-9 items-center justify-center rounded-lg border border-ivory/15 bg-black/75 text-xl text-ivory disabled:opacity-30">‹</button>
          <button type="button" aria-label="Carte successive nella tua mano" disabled={first + pageSize >= count} onClick={() => setStartIndex((index) => Math.min(Math.max(0, count - pageSize), index + pageSize))} className="pointer-events-auto flex h-10 w-9 items-center justify-center rounded-lg border border-ivory/15 bg-black/75 text-xl text-ivory disabled:opacity-30">›</button>
        </div>
      )}
    </section>
  )
}
