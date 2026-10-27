import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useMotionValue } from 'motion/react'
import type { TableCard } from '../../types/card'
import type { NormalizedPosition } from '../../types/position'
import { useElementSize } from '../../hooks/useElementSize'
import { useTableGame } from '../../hooks/useTableGame'
import { CardCollectionDialog } from '../card/CardCollectionDialog'
import { PlayingCard } from '../card/PlayingCard'
import { DeckPile } from '../deck/DeckPile'
import { HandView } from '../hand/HandView'
import { PileView } from '../pile/PileView'
import { Kbd } from '../shared/Kbd'
import { Wordmark } from '../shared/Wordmark'
import { ZoneView } from '../zone/ZoneView'

type TableSurfaceProps = {
  onBackHome?: () => void
}

type TableAction = 'move-deck' | 'shuffle' | 'create-pile' | 'flip-selected' | 'reset'

const CARD_WIDTH = 112

const initialDeckPosition: NormalizedPosition = {
  x: 0.12,
  y: 0.46,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function TableSurface({ onBackHome }: TableSurfaceProps) {
  const tableRef = useRef<HTMLElement | null>(null)
  const handRef = useRef<HTMLDivElement | null>(null)
  const zoneRef = useRef<HTMLDivElement | null>(null)
  const actionMenuRef = useRef<HTMLDivElement | null>(null)
  const noticeId = useRef(0)

  const tableSize = useElementSize(tableRef)

  const [openCollection, setOpenCollection] = useState<{
    title: string
    cards: TableCard[]
    onExtractTopCard?: () => void
  } | null>(null)
  const [notice, setNotice] = useState<{ id: number, text: string } | null>(null)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [deckPosition, setDeckPosition] = useState<NormalizedPosition>(initialDeckPosition)
  const [isMovingDeck, setIsMovingDeck] = useState(false)

  const deckX = useMotionValue(0)
  const deckY = useMotionValue(0)

  const {
    deck,
    looseCards,
    selectedCardIds,
    piles,
    hands,
    zones,
    drawCard,
    drawCardToHand,
    playCardFromHand,
    moveLooseCardToHand,
    moveLooseCardToZone,
    bringLooseCardToFront,
    flipCard,
    selectCard,
    selectOnlyCard,
    clearSelection,
    moveSelectedCards,
    updatePilePosition,
    bringPileToFront,
    extractTopCardFromPile,
    moveLooseCardOrAddToPile,
    moveSelectedCardsOrAddToPile,
    moveCardFromHandToZone,
    extractTopCardFromZone,
    createPileFromSelection,
    shuffleDeck,
    resetGame,
  } = useTableGame()

  const playerHand = hands[0]
  const discardZone = zones.find((zone) => zone.id === 'discard-zone')
  const canCreatePile = selectedCardIds.length >= 2
  const canFlipSelected = selectedCardIds.length > 0

  function notify(text: string) {
    noticeId.current += 1
    setNotice({ id: noticeId.current, text })
  }

  useEffect(() => {
    if (!notice) return

    const timeout = window.setTimeout(() => setNotice(null), 2200)

    return () => window.clearTimeout(timeout)
  }, [notice])

  // The deck is placed by left/top; once a drag is committed there, drop the drag offset
  // before paint so it doesn't get applied twice.
  useLayoutEffect(() => {
    deckX.set(0)
    deckY.set(0)
  }, [deckPosition, deckX, deckY])

  function isPositionInside(element: HTMLElement | null, position: NormalizedPosition) {
    const table = tableRef.current

    if (!table || !element) return false

    const tableRect = table.getBoundingClientRect()
    const rect = element.getBoundingClientRect()

    const x = tableRect.left + position.x * tableRect.width
    const y = tableRect.top + position.y * tableRect.height

    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }

  function closeActionMenu() {
    setActionMenuOpen(false)
    setConfirmingReset(false)
  }

  function runAction(action: TableAction) {
    switch (action) {
      case 'move-deck':
        setIsMovingDeck(true)
        return
      case 'shuffle':
        shuffleDeck()
        notify('Deck shuffled')
        return
      case 'create-pile':
        if (!canCreatePile) {
          notify('Select at least two cards first')
          return
        }

        createPileFromSelection()
        notify('Pile made')
        return
      case 'flip-selected':
        if (!canFlipSelected) {
          notify('Select a card first')
          return
        }

        selectedCardIds.forEach((cardId) => flipCard(cardId))
        notify(selectedCardIds.length === 1 ? 'Card flipped' : `${selectedCardIds.length} cards flipped`)
        return
      case 'reset':
        resetGame()
        setDeckPosition(initialDeckPosition)
        setIsMovingDeck(false)
        notify('Fresh deck, empty table')
        return
    }
  }

  function handleMenuAction(action: TableAction) {
    if (action === 'reset' && !confirmingReset) {
      setConfirmingReset(true)
      return
    }

    closeActionMenu()
    runAction(action)
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return

      const key = event.key.toLowerCase()

      if (key === 'escape') {
        closeActionMenu()
        setOpenCollection(null)
        setIsMovingDeck(false)
        return
      }

      if (openCollection) return

      if (key === 'p') runAction('create-pile')
      if (key === 'f') runAction('flip-selected')
      if (key === 's') runAction('shuffle')
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        closeActionMenu()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  function getDrawLanding(): NormalizedPosition {
    const step = tableSize.width > 0 ? (CARD_WIDTH + 48) / tableSize.width : 0.12
    const direction = deckPosition.x > 0.6 ? -1 : 1

    return { x: deckPosition.x + direction * step, y: deckPosition.y }
  }

  function handleDrawToTable() {
    drawCard(getDrawLanding(), deckPosition)
  }

  function handleDrawToHand() {
    if (!playerHand) return

    drawCardToHand(playerHand.id)
  }

  function handleDeckDragEnd() {
    const { width, height } = tableSize

    if (width > 0 && height > 0) {
      setDeckPosition({
        x: clamp(deckPosition.x + deckX.get() / width, 0.06, 0.94),
        y: clamp(deckPosition.y + deckY.get() / height, 0.14, 0.8),
      })
    }

    setIsMovingDeck(false)
    notify('Deck moved')
  }

  return (
    <main className="min-h-dvh bg-night p-3 md:p-5">
      <section
        ref={tableRef}
        aria-label="Card table"
        className="felt table-edge relative h-[calc(100dvh-1.5rem)] min-h-[34rem] w-full overflow-hidden rounded-[1.25rem] md:h-[calc(100dvh-2.5rem)]"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            clearSelection()
          }
        }}
      >
        <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-between px-5 py-4 md:px-8 md:py-6">
          <div className="pointer-events-auto">
            <Wordmark onClick={onBackHome} />
          </div>

          <div ref={actionMenuRef} className="pointer-events-auto relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={actionMenuOpen}
              onClick={() => (actionMenuOpen ? closeActionMenu() : setActionMenuOpen(true))}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-ivory/15 bg-black/25 px-3.5 text-sm font-medium text-ivory/90 transition-colors hover:border-ivory/25 hover:bg-black/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Actions
              <svg
                viewBox="0 0 12 12"
                aria-hidden="true"
                className={`h-3 w-3 transition-transform duration-150 ${actionMenuOpen ? 'rotate-180' : ''}`}
              >
                <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <AnimatePresence>
              {actionMenuOpen && (
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute top-full right-0 mt-2 w-60 rounded-lg border border-white/10 bg-[#141614]/95 p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm"
                >
                  <MenuItem shortcut="S" onClick={() => handleMenuAction('shuffle')}>
                    Shuffle deck
                  </MenuItem>
                  <MenuItem shortcut="P" disabled={!canCreatePile} onClick={() => handleMenuAction('create-pile')}>
                    Make a pile
                  </MenuItem>
                  <MenuItem shortcut="F" disabled={!canFlipSelected} onClick={() => handleMenuAction('flip-selected')}>
                    Flip selected
                  </MenuItem>
                  <MenuItem onClick={() => handleMenuAction('move-deck')}>
                    Move deck
                  </MenuItem>
                  <div className="mx-2 my-1.5 h-px bg-white/10" />
                  <MenuItem destructive onClick={() => handleMenuAction('reset')}>
                    {confirmingReset ? 'Click again to clear the table' : 'Reset table'}
                  </MenuItem>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        <div className="pointer-events-none absolute top-5 left-1/2 z-50 -translate-x-1/2 md:top-7">
          <AnimatePresence mode="wait">
            {isMovingDeck ? (
              <Notice key="moving-deck">Drag the deck somewhere else · Esc to cancel</Notice>
            ) : notice && (
              <Notice key={notice.id}>{notice.text}</Notice>
            )}
          </AnimatePresence>
        </div>

        <motion.div
          drag={isMovingDeck}
          dragConstraints={tableRef}
          dragElastic={0}
          dragMomentum={false}
          onDragEnd={handleDeckDragEnd}
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${deckPosition.x * 100}%`,
            top: `${deckPosition.y * 100}%`,
            x: deckX,
            y: deckY,
          }}
        >
          <DeckPile
            cardsRemaining={deck.length}
            isMoving={isMovingDeck}
            onDraw={handleDrawToTable}
            onDrawToHand={handleDrawToHand}
          />
        </motion.div>

        <div
          ref={zoneRef}
          className="absolute top-[46%] right-[7%] z-10 -translate-y-1/2"
        >
          {zones.map((zone) => (
            <ZoneView
              key={zone.id}
              zone={zone}
              onOpen={() =>
                setOpenCollection({
                  title: zone.label,
                  cards: zone.cards,
                  onExtractTopCard: () => {
                    extractTopCardFromZone(zone.id, { x: 0.7, y: 0.46 })
                    setOpenCollection(null)
                  },
                })
              }
            />
          ))}
        </div>

        {/* Own stacking context, so ever-growing card z-indexes stay below the hand and the menu. */}
        <div className="pointer-events-none absolute inset-0 z-20 [&>*]:pointer-events-auto">
          {piles.map((pile) => (
            <PileView
              key={pile.id}
              pile={pile}
              dragConstraintsRef={tableRef}
              tableSize={tableSize}
              onPositionCommit={(position) => updatePilePosition(pile.id, position)}
              onDragStart={() => bringPileToFront(pile.id)}
              onOpen={() => {
                setOpenCollection({
                  title: 'Pile',
                  cards: pile.cards,
                  onExtractTopCard: () => {
                    extractTopCardFromPile(pile.id)
                    setOpenCollection(null)
                  },
                })
              }}
            />
          ))}

          {looseCards.map((card) => (
            <PlayingCard
              key={card.id}
              rank={card.rank}
              suit={card.suit}
              faceUp={card.faceUp}
              dragConstraintsRef={tableRef}
              tableSize={tableSize}
              position={card.position}
              spawnPosition={card.spawnFrom}
              zIndex={card.zIndex}
              selected={selectedCardIds.includes(card.id)}
              onSelect={(additive) => selectCard(card.id, additive)}
              onSelectOnly={() => selectOnlyCard(card.id)}
              onDragStart={() => bringLooseCardToFront(card.id)}
              onDragMove={(delta) => moveSelectedCards(card.id, delta)}
              onFlip={() => flipCard(card.id)}
              onPositionCommit={(position) => {
                const isPartOfMultiSelection =
                  selectedCardIds.length > 1 &&
                  selectedCardIds.includes(card.id)

                if (isPartOfMultiSelection) {
                  moveSelectedCardsOrAddToPile(card.id, position)
                  return
                }

                if (playerHand && isPositionInside(handRef.current, position)) {
                  moveLooseCardToHand(card.id, playerHand.id)
                  return
                }

                if (discardZone && isPositionInside(zoneRef.current, position)) {
                  moveLooseCardToZone(card.id, discardZone.id)
                  return
                }

                moveLooseCardOrAddToPile(card.id, position)
              }}
            />
          ))}
        </div>

        <div className="pointer-events-none absolute bottom-5 left-5 z-20 hidden max-w-[17rem] text-xs leading-relaxed text-ivory/45 md:left-8 lg:block">
          <p>
            Double-click a card to flip it. Shift-click to pick up several, then press{' '}
            <Kbd>P</Kbd> to stack them.
          </p>
        </div>

        <div
          ref={handRef}
          className="absolute -bottom-8 left-1/2 z-30 w-[min(70rem,86vw)] -translate-x-1/2"
        >
          {hands.map((hand) => (
            <HandView
              key={hand.id}
              hand={hand}
              tableRef={tableRef}
              onDropCard={(cardId, position) => {
                // Dropped back onto the hand: let it snap back into place.
                if (isPositionInside(handRef.current, position)) return

                if (discardZone && isPositionInside(zoneRef.current, position)) {
                  moveCardFromHandToZone(hand.id, cardId, discardZone.id)
                  return
                }

                playCardFromHand(hand.id, cardId, position)
              }}
            />
          ))}
        </div>

        {openCollection && (
          <CardCollectionDialog
            title={openCollection.title}
            cards={openCollection.cards}
            onClose={() => setOpenCollection(null)}
            onExtractTopCard={openCollection.onExtractTopCard}
          />
        )}
      </section>
    </main>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      role="status"
      className="rounded-full bg-black/40 px-4 py-1.5 text-sm whitespace-nowrap text-ivory/90 shadow-[0_6px_18px_rgba(0,0,0,0.25)] backdrop-blur-sm"
    >
      {children}
    </motion.p>
  )
}

type MenuItemProps = {
  children: ReactNode
  onClick: () => void
  shortcut?: string
  disabled?: boolean
  destructive?: boolean
}

function MenuItem({
  children,
  onClick,
  shortcut,
  disabled = false,
  destructive = false,
}: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-default disabled:text-ivory/30 disabled:hover:bg-transparent ${
        destructive
          ? 'text-[#e08a80] hover:bg-[#e08a80]/10'
          : 'text-ivory/90 hover:bg-white/[0.06]'
      }`}
    >
      {children}
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </button>
  )
}
