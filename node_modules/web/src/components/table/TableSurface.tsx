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
import { RevealedHands } from '../hand/RevealedHands'
import { DealCardsDialog } from './DealCardsDialog'
import { RevealHandDialog } from './RevealHandDialog'
import { PileView } from '../pile/PileView'
import { Kbd } from '../shared/Kbd'
import { Wordmark } from '../shared/Wordmark'
import { ZoneView } from '../zone/ZoneView'
import type { Player } from '../../types/player'
import type { TableGameState } from '../../types/game'
import { socket } from '../../multiplayer/socket'

type TableSurfaceProps = {
  onBackHome?: () => void
  currentPlayerId: string
  roomId: string
  players: Player[]
  initialTableState: TableGameState
  connectionStatus: 'connected' | 'reconnecting' | 'resuming'
  connectionIssue: string | null
  onRetryConnection: () => void
}

type TableAction = 'move-deck' | 'shuffle' | 'create-pile' | 'flip-selected' | 'rotate-selected' | 'show-hand-all' | 'show-hand-selected' | 'hide-hand' | 'deal' | 'reset'

const CARD_WIDTH = 112

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function TableSurface({ onBackHome, currentPlayerId, roomId, players, initialTableState, connectionStatus, connectionIssue, onRetryConnection }: TableSurfaceProps) {
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
    onFlipPile?: () => void
    onRotatePile?: () => void
    onShufflePile?: () => void
  } | null>(null)
  const [notice, setNotice] = useState<{ id: number, text: string } | null>(null)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [isMovingDeck, setIsMovingDeck] = useState(false)
  const [dealingOpen, setDealingOpen] = useState(false)
  const [revealDialogMode, setRevealDialogMode] = useState<'all' | 'selected' | null>(null)
  const [selectedHandCardIds, setSelectedHandCardIds] = useState<string[]>([])

  const deckX = useMotionValue(0)
  const deckY = useMotionValue(0)

  const {
    deckCount,
    deckPosition,
    looseCards,
    selectedCardIds,
    piles,
    hands,
    zones,
    drawCard,
    flipSelectedCards,
    moveDeck,
    drawCardToHand,
    dealCards,
    revealEntireHand,
    revealSelectedHandCards,
    hideRevealedHandCards,
    rotateSelectedCards,
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
    rotatePile,
    flipPile,
    shufflePile,
    extractTopCardFromPile,
    moveLooseCardOrAddToPile,
    moveSelectedCardsOrAddToPile,
    moveCardFromHandToZone,
    moveSelectedCardsToZone,
    moveSelectedCardsToHand,
    extractTopCardFromZone,
    createPileFromSelection,
    shuffleDeck,
    resetGame,
    replaceGameState,
  } = useTableGame(initialTableState, notify)

  const isHost = players.some((player) => player.id === currentPlayerId && player.isHost)
  const onlineCount = players.filter((player) => player.online).length
  const playerHand = hands.find((hand) => hand.playerId === currentPlayerId)
  const discardZone = zones.find((zone) => zone.id === 'discard-zone')
  const canCreatePile = selectedCardIds.length >= 2
  const canFlipSelected = selectedCardIds.length > 0
  const canShowHand = !!playerHand?.cards.length
  const isShowingHand = !!playerHand?.revealedCardIds.length
  const canShowSelected = selectedHandCardIds.length > 0

  useEffect(() => {
    const currentIds = new Set(playerHand?.cards.map((card) => card.id) ?? [])
    setSelectedHandCardIds((selected) => selected.filter((id) => currentIds.has(id)))
  }, [playerHand?.cards])

  function notify(text: string) {
    noticeId.current += 1
    setNotice({ id: noticeId.current, text })
  }

  useEffect(() => {
    if (!notice) return

    const timeout = window.setTimeout(() => setNotice(null), 2200)

    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    function handleTableState(
      table: TableGameState,
    ) {
      replaceGameState(table)
    }

    socket.on('table:state', handleTableState)

    return () => {
      socket.off(
        'table:state',
        handleTableState,
      )
    }
  }, [])

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
        flipSelectedCards()
        notify(selectedCardIds.length === 1 ? 'Card flipped' : `${selectedCardIds.length} cards flipped`)
        return
      case 'rotate-selected':
        if (!canFlipSelected) return
        rotateSelectedCards()
        notify(`${selectedCardIds.length} cards rotated`)
        return
      case 'deal':
        setDealingOpen(true)
        return
      case 'show-hand-all':
        if (!canShowHand) return
        setRevealDialogMode('all')
        notify('Entire hand shown to other players')
        return
      case 'show-hand-selected':
        if (!canShowSelected) return
        setRevealDialogMode('selected')
        notify(`${selectedHandCardIds.length} hand cards shown`)
        return
      case 'hide-hand':
        hideRevealedHandCards()
        notify('Hand display hidden')
        return
      case 'reset':
        if (!isHost) {
          notify('Only the host can reset the table')
          return
        }
        resetGame()
        setIsMovingDeck(false)
        notify('Fresh deck, empty table')
        return
    }
  }

  function handleMenuAction(action: TableAction) {
    if (action === 'reset' && !isHost) return
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
        setDealingOpen(false)
        setIsMovingDeck(false)
        setRevealDialogMode(null)
        return
      }

      if (openCollection || revealDialogMode || dealingOpen) return

      if (key === 'p') runAction('create-pile')
      if (key === 'f') runAction('flip-selected')
      if (key === 's') runAction('shuffle')
      if (key === 'r') runAction('rotate-selected')
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

    return { x: clamp(deckPosition.x + direction * step, 0, 1), y: deckPosition.y }
  }

  function handleDrawToTable() {
    drawCard(getDrawLanding(), deckPosition)
  }

  function handleDrawToHand() {
    if (!playerHand) return

    drawCardToHand()
  }

  function handleDeckDragEnd() {
    const { width, height } = tableSize

    if (width > 0 && height > 0) {
      moveDeck({
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

          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
            <div className="rounded-full border border-ivory/10 bg-black/20 px-3 py-1.5 text-xs text-ivory/55">
              Room{' '}
              <span className="font-semibold tracking-[0.12em] text-ivory/85">
                {roomId}
              </span>

              <span className="mx-2 text-ivory/20">·</span>

              {players.length} {players.length === 1 ? 'player' : 'players'} · {onlineCount} online
            </div>
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
                  className="absolute top-full right-0 mt-2 max-h-[min(76dvh,37rem)] w-60 overflow-y-auto rounded-lg border border-white/10 bg-[#141614]/95 p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm"
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
                  <MenuItem shortcut="R" disabled={!canFlipSelected} onClick={() => handleMenuAction('rotate-selected')}>
                    Rotate selected 90°
                  </MenuItem>
                  <MenuItem onClick={() => handleMenuAction('move-deck')}>
                    Move deck
                  </MenuItem>
                  <MenuItem disabled={deckCount === 0 || players.length === 0} onClick={() => handleMenuAction('deal')}>
                    Deal cards…
                  </MenuItem>
                  <div className="mx-2 my-1.5 h-px bg-white/10" />
                  <MenuItem disabled={!canShowHand || players.length < 2} onClick={() => handleMenuAction('show-hand-all')}>
                    Show entire hand
                  </MenuItem>
                  <MenuItem disabled={!canShowSelected || players.length < 2} onClick={() => handleMenuAction('show-hand-selected')}>
                    Show selected hand cards
                  </MenuItem>
                  <MenuItem disabled={!isShowingHand} onClick={() => handleMenuAction('hide-hand')}>
                    Hide revealed cards
                  </MenuItem>
                  <div className="mx-2 my-1.5 h-px bg-white/10" />
                  <MenuItem destructive disabled={!isHost} onClick={() => handleMenuAction('reset')}>
                    {confirmingReset ? 'Click again to clear the table' : 'Reset table'}
                  </MenuItem>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        <RevealedHands hands={hands} players={players} selfId={currentPlayerId} />

        {connectionStatus !== 'connected' && (
          <div aria-hidden="true" className="absolute inset-0 z-[35] cursor-wait bg-black/10" />
        )}

        {connectionStatus !== 'connected' && (
          <div role="status" className="absolute inset-x-5 top-[5.25rem] z-[60] mx-auto max-w-md rounded-lg border border-amber-300/25 bg-black/80 px-4 py-3 text-center text-sm text-ivory shadow-lg">
            <div className="font-medium">{connectionStatus === 'resuming' ? 'Restoring your session…' : 'Connection interrupted — reconnecting…'}</div>
            {connectionIssue && <div className="mt-1 text-xs text-ivory/65">{connectionIssue}</div>}
            {connectionStatus === 'reconnecting' && (
              <button type="button" onClick={onRetryConnection} className="mt-2 rounded border border-ivory/30 px-3 py-1.5 text-xs text-ivory/85 hover:bg-white/10">Try reconnecting</button>
            )}
          </div>
        )}

        {connectionStatus === 'connected' && connectionIssue && (
          <div role="alert" className="absolute inset-x-5 top-[5.25rem] z-[60] mx-auto max-w-md rounded-lg bg-black/80 px-4 py-3 text-center text-sm text-[#e08a80]">{connectionIssue}</div>
        )}

        <div aria-label="Room participants" className="pointer-events-none absolute right-5 bottom-5 z-40 hidden max-w-[17rem] flex-wrap justify-end gap-1.5 lg:flex">
          {players.map((player) => (
            <span key={player.id} title={player.online ? 'Online' : 'Disconnected; seat saved'} className={`rounded-full border px-2.5 py-1 text-[11px] ${player.online ? 'border-ivory/20 bg-black/25 text-ivory/80' : 'border-ivory/10 bg-black/15 text-ivory/35'}`}>
              <span aria-hidden="true">{player.online ? '●' : '○'}</span>{' '}{player.name}{player.isHost ? ' · Host' : ''}{player.id === currentPlayerId ? ' · You' : ''}
            </span>
          ))}
        </div>

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
            cardsRemaining={deckCount}
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
        <div className="pointer-events-none absolute inset-0 z-20 *:pointer-events-auto">
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
                  onRotatePile: () => { rotatePile(pile.id); setOpenCollection(null) },
                  onFlipPile: () => { flipPile(pile.id); setOpenCollection(null) },
                  onShufflePile: () => shufflePile(pile.id),
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
              rotation={card.rotation}
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
                  if (playerHand && isPositionInside(handRef.current, position)) {
                    moveSelectedCardsToHand()
                    return
                  }

                  if (discardZone && isPositionInside(zoneRef.current, position)) {
                    moveSelectedCardsToZone(discardZone.id)
                    return
                  }

                  moveSelectedCardsOrAddToPile(card.id, position)
                  return
                }

                if (playerHand && isPositionInside(handRef.current, position)) {
                  moveLooseCardToHand(card.id)
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
          {hands.filter((hand) => hand.playerId === currentPlayerId).map((hand) => (
            <HandView
              key={hand.id}
              hand={hand}
              tableRef={tableRef}
              selectedCardIds={selectedHandCardIds}
              onToggleCardSelection={(id) => setSelectedHandCardIds((selected) => selected.includes(id) ? selected.filter((cardId) => cardId !== id) : [...selected, id])}
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

        {dealingOpen && (
          <DealCardsDialog players={players} deckCount={deckCount} onDeal={dealCards} onClose={() => setDealingOpen(false)} />
        )}

        {revealDialogMode && (
          <RevealHandDialog mode={revealDialogMode} players={players.filter( (player) => player.id !== currentPlayerId )} selectedCount={selectedHandCardIds.length} onClose={() => setRevealDialogMode(null)} onConfirm={(recipientIds) => {
              if (revealDialogMode === 'all') revealEntireHand(recipientIds)
              else revealSelectedHandCards(selectedHandCardIds, recipientIds)

              notify('Sharing requested')
              setRevealDialogMode(null)
            }}
          />
        )}

        {openCollection && (
          <CardCollectionDialog
            title={openCollection.title}
            cards={openCollection.cards}
            onClose={() => setOpenCollection(null)}
            onExtractTopCard={openCollection.onExtractTopCard}
            onFlipPile={openCollection.onFlipPile}
            onRotatePile={openCollection.onRotatePile}
            onShufflePile={openCollection.onShufflePile}
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
      className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-default disabled:text-ivory/30 disabled:hover:bg-transparent ${destructive
        ? 'text-[#e08a80] hover:bg-[#e08a80]/10'
        : 'text-ivory/90 hover:bg-white/6'
        }`}
    >
      {children}
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </button>
  )
}
