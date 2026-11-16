import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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
import { inItalian } from '../../utils/italian'

type TableSurfaceProps = {
  onBackHome?: () => void
  onDeleteRoom?: () => void
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

export function TableSurface({ onBackHome, onDeleteRoom, currentPlayerId, roomId, players, initialTableState, connectionStatus, connectionIssue, onRetryConnection }: TableSurfaceProps) {
  const tableRef = useRef<HTMLElement | null>(null)
  const handRef = useRef<HTMLDivElement | null>(null)
  const zoneRef = useRef<HTMLDivElement | null>(null)
  const actionMenuRef = useRef<HTMLDivElement | null>(null)
  const mobileDockRef = useRef<HTMLElement | null>(null)
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
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [draggingCard, setDraggingCard] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [isMovingDeck, setIsMovingDeck] = useState(false)
  const [dealingOpen, setDealingOpen] = useState(false)
  const [revealDialogMode, setRevealDialogMode] = useState<'all' | 'selected' | null>(null)
  const [selectedHandCardIds, setSelectedHandCardIds] = useState<string[]>([])
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [fullscreenActive, setFullscreenActive] = useState(false)

  // The mobile visual viewport shrinks when browser chrome is visible. Lock
  // document scrolling only for this route, and resize the felt to the portion
  // of the screen actually visible instead of using the 100vh layout viewport.
  useEffect(() => {
    const html = document.documentElement
    html.classList.add('vd-game-active')
    const viewport = window.visualViewport
    const updateViewportHeight = () => {
      const height = Math.round(viewport?.height ?? window.innerHeight)
      if (height > 0) html.style.setProperty('--vd-viewport-height', `${height}px`)
    }
    updateViewportHeight()
    viewport?.addEventListener('resize', updateViewportHeight)
    window.addEventListener('resize', updateViewportHeight)
    return () => {
      viewport?.removeEventListener('resize', updateViewportHeight)
      window.removeEventListener('resize', updateViewportHeight)
      html.classList.remove('vd-game-active')
      html.style.removeProperty('--vd-viewport-height')
    }
  }, [])

  useEffect(() => {
    const syncFullscreen = () => setFullscreenActive(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', syncFullscreen)
    syncFullscreen()
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (document.documentElement.requestFullscreen && document.fullscreenEnabled) {
        await document.documentElement.requestFullscreen()
      } else {
        notify('Schermo intero non disponibile. Prova Aggiungi alla schermata Home.')
      }
    } catch {
      notify('Schermo intero bloccato dal browser. Prova Aggiungi alla schermata Home.')
    }
  }

  const notify = useCallback((text: string) => {
    noticeId.current += 1
    setNotice({ id: noticeId.current, text })
  }, [])

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
  const selectedHandCard = playerHand?.cards.find((card) => selectedHandCardIds.includes(card.id))

  useEffect(() => {
    const currentIds = new Set(playerHand?.cards.map((card) => card.id) ?? [])
    setSelectedHandCardIds((selected) => selected.filter((id) => currentIds.has(id)))
  }, [playerHand?.cards])

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

    function handleRoomNotice(message: string) {
      notify(inItalian(message))
    }

    socket.on('table:state', handleTableState)
    socket.on('room:notice', handleRoomNotice)

    return () => {
      socket.off('table:state', handleTableState)
      socket.off('room:notice', handleRoomNotice)
    }
  }, [replaceGameState, notify])

  // The deck is placed by left/top; once a drag is committed there, drop the drag offset
  // before paint so it doesn't get applied twice.
  useLayoutEffect(() => {
    deckX.set(0)
    deckY.set(0)
  }, [deckPosition, deckX, deckY])

  function isPositionInside(element: HTMLElement | null, position: NormalizedPosition, tolerancePx = 0) {
    const table = tableRef.current

    if (!table || !element) return false

    const tableRect = table.getBoundingClientRect()
    const rect = element.getBoundingClientRect()

    const x = tableRect.left + position.x * tableRect.width
    const y = tableRect.top + position.y * tableRect.height

    return x >= rect.left - tolerancePx && x <= rect.right + tolerancePx &&
      y >= rect.top - tolerancePx && y <= rect.bottom + tolerancePx
  }

  function closeActionMenu() {
    setActionMenuOpen(false)
    setMobileMoreOpen(false)
    setConfirmingReset(false)
  }

  async function runAction(action: TableAction) {
    switch (action) {
      case 'move-deck':
        setIsMovingDeck((current) => !current)
        return
      case 'shuffle':
        if (await shuffleDeck()) notify('Mazzo mescolato')
        return
      case 'create-pile':
        if (!canCreatePile) {
          notify('Seleziona almeno due carte')
          return
        }

        if (await createPileFromSelection()) notify('Pila creata')
        return
      case 'flip-selected':
        if (!canFlipSelected) {
          notify('Seleziona prima una carta')
          return
        }
        if (await flipSelectedCards()) notify(selectedCardIds.length === 1 ? 'Carta girata' : `${selectedCardIds.length} carte girate`)
        return
      case 'rotate-selected':
        if (!canFlipSelected) {
          notify('Tocca prima una carta')
          return
        }
        if (await rotateSelectedCards()) notify(`${selectedCardIds.length} carte ruotate`)
        return
      case 'deal':
        setDealingOpen(true)
        return
      case 'show-hand-all':
        if (!canShowHand) return
        setRevealDialogMode('all')
        return
      case 'show-hand-selected':
        if (!canShowSelected) return
        setRevealDialogMode('selected')
        return
      case 'hide-hand':
        if (await hideRevealedHandCards()) notify('Mano nascosta')
        return
      case 'reset':
        if (!isHost) {
          notify('Solo l’host può azzerare il tavolo')
          return
        }
        if (await resetGame()) {
          setIsMovingDeck(false)
          notify('Nuovo mazzo, tavolo libero')
        }
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
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node) &&
          !mobileDockRef.current?.contains(event.target as Node)) {
        closeActionMenu()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  function getDrawLanding(): NormalizedPosition {
    const cardWidth = tableSize.width < 640 ? 76 : CARD_WIDTH
    const step = tableSize.width > 0 ? (cardWidth + (tableSize.width < 640 ? 20 : 48)) / tableSize.width : 0.12
    const direction = deckPosition.x > 0.6 ? -1 : 1

    return { x: clamp(deckPosition.x + direction * step, 0, 1), y: deckPosition.y }
  }

  async function handleDrawToTable() {
    // Acknowledged feedback distinguishes a successful touch from a rejected
    // draw. Do not claim success before the authoritative server responds.
    if (await drawCard(getDrawLanding(), deckPosition)) notify('Carta pescata')
  }

  function handleDrawToHand() {
    if (!playerHand) return

    drawCardToHand()
  }

  async function handlePlaySelectedHandCard(toDiscard = false) {
    if (!playerHand || !selectedHandCard) {
      notify('Seleziona prima una carta della tua mano')
      return
    }
    const ok = toDiscard && discardZone
      ? await moveCardFromHandToZone(playerHand.id, selectedHandCard.id, discardZone.id)
      : await playCardFromHand(playerHand.id, selectedHandCard.id, {
          x: clamp(0.45 + (looseCards.length % 4) * 0.045, 0.15, 0.85),
          y: 0.51,
        })
    if (ok) {
      setSelectedHandCardIds((ids) => ids.filter((id) => id !== selectedHandCard.id))
      notify(toDiscard ? 'Carta spostata negli scarti' : 'Carta giocata sul tavolo')
    }
  }

  async function handleCopyRoomCode() {
    try {
      await navigator.clipboard.writeText(roomId)
      notify('Codice stanza copiato')
    } catch {
      notify(`Codice stanza: ${roomId}`)
    }
  }

  async function handleDeckDragEnd() {
    const { width, height } = tableSize

    if (width > 0 && height > 0) {
      if (await moveDeck({
        x: clamp(deckPosition.x + deckX.get() / width, 0.06, 0.94),
        y: clamp(deckPosition.y + deckY.get() / height, 0.14, 0.8),
      })) notify('Mazzo spostato')
    }

    setIsMovingDeck(false)
  }

  return (
    <main className="game-page bg-night p-1.5 sm:p-3 md:p-5">
      <section
        ref={tableRef}
        aria-label="Tavolo da gioco"
        className={`game-table felt table-edge relative overflow-hidden rounded-[1rem] sm:rounded-[1.25rem] ${draggingCard ? 'dragging-card' : ''}`}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            clearSelection()
          }
        }}
      >
        {/* The empty felt prevents browser panning but the action/menu/dialog
            controls above it can still scroll within their own containers. */}
        <div aria-hidden="true" className="game-playfield-background absolute inset-0" onPointerDown={clearSelection} />
        <header className={`game-header pointer-events-none absolute inset-x-0 top-0 ${actionMenuOpen ? 'z-[70]' : 'z-40'} flex items-center justify-between gap-2 px-3 py-3 sm:px-5 sm:py-4 md:px-8 md:py-6`}>
          <div className="pointer-events-auto">
            <Wordmark />
          </div>

          <div className="game-room-code pointer-events-auto absolute top-[3.45rem] left-1/2 w-max max-w-[calc(100%-1rem)] -translate-x-1/2 sm:top-1/2 sm:-translate-y-1/2">
            <button type="button" onClick={handleCopyRoomCode} title="Copia il codice stanza" className="rounded-full border border-ivory/10 bg-black/30 px-3 py-1.5 text-[11px] text-ivory/70 hover:bg-black/50 focus-visible:outline-2 focus-visible:outline-gold sm:text-xs">
              Stanza <span className="font-semibold tracking-[0.12em] text-ivory/95">{roomId}</span>
              <span className="mx-2 text-ivory/30">·</span>
              {onlineCount}/{players.length} in linea
              <span className="ml-2 text-gold">Copia</span>
            </button>
          </div>

          <div ref={actionMenuRef} className="pointer-events-auto relative flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreenActive ? 'Esci dallo schermo intero' : 'Schermo intero'}
              title={fullscreenActive ? 'Esci dallo schermo intero' : 'Schermo intero (se disponibile)'}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-ivory/15 bg-black/25 text-ivory/90 transition-colors hover:border-ivory/25 hover:bg-black/35 focus-visible:outline-2 focus-visible:outline-gold"
            >
              {fullscreenActive ? (
                <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3v6H3M15 3v6h6M3 15h6v6M21 15h-6v6" /></svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" /></svg>
              )}
            </button>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={actionMenuOpen}
              onClick={() => (actionMenuOpen ? closeActionMenu() : setActionMenuOpen(true))}
              className="game-header-actions-button inline-flex h-10 items-center gap-2 rounded-md border border-ivory/15 bg-black/25 px-3.5 text-sm font-medium text-ivory/90 transition-colors hover:border-ivory/25 hover:bg-black/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Azioni
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
                  className="game-action-menu absolute top-full right-0 mt-2 max-h-[calc(100dvh-5rem)] w-60 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg border border-white/10 bg-[#141614]/95 p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm"
                >
                  <MenuItem shortcut="S" onClick={() => handleMenuAction('shuffle')}>
                    Mescola mazzo
                  </MenuItem>
                  <MenuItem shortcut="P" disabled={!canCreatePile} onClick={() => handleMenuAction('create-pile')}>
                    Crea pila
                  </MenuItem>
                  <MenuItem shortcut="F" disabled={!canFlipSelected} onClick={() => handleMenuAction('flip-selected')}>
                    Gira selezionate
                  </MenuItem>
                  <MenuItem shortcut="R" disabled={!canFlipSelected} onClick={() => handleMenuAction('rotate-selected')}>
                    Ruota selezionate 90°
                  </MenuItem>
                  <MenuItem onClick={() => handleMenuAction('move-deck')}>
                    {isMovingDeck ? 'Annulla spostamento' : 'Sposta mazzo'}
                  </MenuItem>
                  <MenuItem disabled={deckCount === 0 || players.length === 0} onClick={() => handleMenuAction('deal')}>
                    Distribuisci carte…
                  </MenuItem>
                  <div className="mx-2 my-1.5 h-px bg-white/10" />
                  <MenuItem disabled={!canShowHand || players.length < 2} onClick={() => handleMenuAction('show-hand-all')}>
                    Mostra tutta la mano
                  </MenuItem>
                  <MenuItem disabled={!canShowSelected || players.length < 2} onClick={() => handleMenuAction('show-hand-selected')}>
                    Mostra carte selezionate
                  </MenuItem>
                  <MenuItem disabled={!isShowingHand} onClick={() => handleMenuAction('hide-hand')}>
                    Nascondi carte mostrate
                  </MenuItem>
                  <div className="mx-2 my-1.5 h-px bg-white/10" />
                  <MenuItem destructive disabled={!isHost} onClick={() => handleMenuAction('reset')}>
                    {confirmingReset ? 'Conferma: azzera il tavolo' : 'Azzera tavolo'}
                  </MenuItem>
                  <div className="mx-2 my-1.5 h-px bg-white/10" />
                  <MenuItem onClick={() => { closeActionMenu(); onBackHome?.() }}>
                    Abbandona stanza
                  </MenuItem>
                  {isHost && (
                    <MenuItem destructive onClick={() => { closeActionMenu(); onDeleteRoom?.() }}>
                      Elimina stanza per tutti…
                    </MenuItem>
                  )}
                  <div className="mt-2 border-t border-white/10 px-2.5 pt-3 pb-1 lg:hidden">
                    <p className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-ivory/45 uppercase">Giocatori</p>
                    <div className="flex flex-wrap gap-1.5">
                      {players.map((player) => (
                        <span key={player.id} className={`rounded-full border px-2 py-1 text-[10px] ${player.online ? 'border-ivory/20 text-ivory/80' : 'border-ivory/10 text-ivory/40'}`}>
                          {player.online ? '●' : '○'} {player.name}{player.isHost ? ' · Host' : ''}{player.id === currentPlayerId ? ' · Tu' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
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
            <div className="font-medium">{connectionStatus === 'resuming' ? 'Ripristino della sessione…' : 'Connessione interrotta — riconnessione…'}</div>
            {connectionIssue && <div className="mt-1 text-xs text-ivory/65">{connectionIssue}</div>}
            {connectionStatus === 'reconnecting' && (
              <button type="button" onClick={onRetryConnection} className="mt-2 rounded border border-ivory/30 px-3 py-1.5 text-xs text-ivory/85 hover:bg-white/10">Riprova la connessione</button>
            )}
          </div>
        )}

        {connectionStatus === 'connected' && connectionIssue && (
          <div role="alert" className="absolute inset-x-5 top-[5.25rem] z-[60] mx-auto max-w-md rounded-lg bg-black/80 px-4 py-3 text-center text-sm text-[#e08a80]">{connectionIssue}</div>
        )}

        <div aria-label="Partecipanti alla stanza" className="pointer-events-none absolute right-5 bottom-5 z-40 hidden max-w-[17rem] flex-wrap justify-end gap-1.5 lg:flex">
          {players.map((player) => (
            <span key={player.id} title={player.online ? 'In linea' : 'Disconnesso; posto conservato'} className={`rounded-full border px-2.5 py-1 text-[11px] ${player.online ? 'border-ivory/20 bg-black/25 text-ivory/80' : 'border-ivory/10 bg-black/15 text-ivory/35'}`}>
              <span aria-hidden="true">{player.online ? '●' : '○'}</span>{' '}{player.name}{player.isHost ? ' · Host' : ''}{player.id === currentPlayerId ? ' · Tu' : ''}
            </span>
          ))}
        </div>

        <div className="game-notice pointer-events-none absolute top-[6.4rem] left-1/2 z-50 w-max max-w-[calc(100%-1rem)] -translate-x-1/2 sm:top-18 md:top-22">
          <AnimatePresence mode="wait">
            {isMovingDeck ? (
              <Notice key="moving-deck">Trascina il mazzo · Azioni per annullare</Notice>
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
          className="game-deck absolute z-10 -translate-x-1/2 -translate-y-1/2"
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
          className="game-discard absolute top-[46%] right-[8%] z-10 -translate-y-1/2 sm:right-[7%]"
        >
          {zones.map((zone) => (
            <ZoneView
              key={zone.id}
              zone={zone}
              onOpen={() =>
                setOpenCollection({
                  title: inItalian(zone.label),
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
                  title: 'Pila',
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
              multiSelectMode={multiSelectMode}
              onEnterMultiSelect={() => setMultiSelectMode(true)}
              onSelect={(additive) => selectCard(card.id, additive)}
              onSelectOnly={() => selectOnlyCard(card.id)}
              onDragStart={() => bringLooseCardToFront(card.id)}
              onDragActiveChange={setDraggingCard}
              onDragMove={(delta) => moveSelectedCards(card.id, delta)}
              onFlip={() => flipCard(card.id)}
              onPositionCommit={(position) => {
                const isPartOfMultiSelection =
                  selectedCardIds.length > 1 &&
                  selectedCardIds.includes(card.id)

                if (isPartOfMultiSelection) {
                  if (playerHand && isPositionInside(handRef.current, position, 16)) {
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

                if (playerHand && isPositionInside(handRef.current, position, 16)) {
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
            Doppio clic per girare una carta. Maiusc + clic per selezionarne più di una, poi premi{' '}
            <Kbd>P</Kbd> per impilarle.
          </p>
        </div>

        <div
          ref={handRef}
          className={`game-hand absolute right-1 bottom-[max(0.25rem,env(safe-area-inset-bottom))] left-1 z-30 sm:right-auto sm:-bottom-8 sm:left-1/2 sm:w-[min(70rem,86vw)] sm:-translate-x-1/2 ${playerHand?.cards.length ? 'with-hand' : 'empty-hand'}`}
        >
          {hands.filter((hand) => hand.playerId === currentPlayerId).map((hand) => (
            <HandView
              key={hand.id}
              hand={hand}
              tableRef={tableRef}
              selectedCardIds={selectedHandCardIds}
              onToggleCardSelection={(id) => setSelectedHandCardIds((selected) => selected.includes(id) ? selected.filter((cardId) => cardId !== id) : [...selected, id])}
              onDragActiveChange={setDraggingCard}
              onDropCard={(cardId, position) => {
                // Dropped back onto the hand: let it snap back into place.
                if (isPositionInside(handRef.current, position, 16)) return

                if (discardZone && isPositionInside(zoneRef.current, position)) {
                  moveCardFromHandToZone(hand.id, cardId, discardZone.id)
                  return
                }

                playCardFromHand(hand.id, cardId, position)
              }}
            />
          ))}
        </div>

        {/* Mobile: four primary actions; secondary actions in a scrollable bottom sheet. */}
        <nav ref={mobileDockRef} aria-label="Comandi del tavolo" className={`game-touch-actions absolute z-40 ${playerHand?.cards.length ? 'with-hand' : 'without-hand'}`}>
          <div className="game-dock-status" role="status">
            {selectedCardIds.length || selectedHandCardIds.length
              ? `${selectedCardIds.length + selectedHandCardIds.length} carte selezionate`
              : 'Tocca una carta per selezionarla · tocca il mazzo per pescare'}
          </div>
          <TouchAction onClick={handleDrawToHand} disabled={deckCount === 0 || !playerHand || isMovingDeck}>In mano</TouchAction>
          <TouchAction onClick={() => handlePlaySelectedHandCard()} disabled={!selectedHandCard}>Gioca</TouchAction>
          <TouchAction onClick={() => {
            if (selectedHandCard && discardZone) void handlePlaySelectedHandCard(true)
            else if (selectedCardIds.length && discardZone) void moveSelectedCardsToZone(discardZone.id)
          }} disabled={!discardZone || (!selectedHandCard && !selectedCardIds.length)}>Scarta</TouchAction>
          <TouchAction active={mobileMoreOpen} onClick={() => setMobileMoreOpen((open) => !open)}>Altro {mobileMoreOpen ? '×' : '☰'}</TouchAction>
          <AnimatePresence>
            {mobileMoreOpen && (
              <motion.div
                role="menu"
                aria-label="Altre azioni"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.15 }}
                className="game-mobile-more absolute inset-x-0 bottom-[calc(100%+8px)] rounded-xl border border-white/15 bg-[#141c18]/98 p-3 text-ivory shadow-2xl backdrop-blur-lg"
              >
                <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
                  <strong className="text-sm">Altre azioni</strong>
                  <button type="button" aria-label="Chiudi altre azioni" onClick={() => setMobileMoreOpen(false)} className="h-10 w-10 rounded-md border border-white/15 text-lg">×</button>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <MenuItem onClick={() => { setMultiSelectMode((mode) => !mode); clearSelection(); setMobileMoreOpen(false) }}>{multiSelectMode ? 'Fine selezione multipla' : 'Selezione multipla'}</MenuItem>
                  <MenuItem disabled={!selectedCardIds.length} onClick={() => { clearSelection(); setMultiSelectMode(false); setMobileMoreOpen(false) }}>Deseleziona</MenuItem>
                  <MenuItem disabled={!canFlipSelected} onClick={() => handleMenuAction('flip-selected')}>Gira selezionate</MenuItem>
                  <MenuItem disabled={!canFlipSelected} onClick={() => handleMenuAction('rotate-selected')}>Ruota selezionate</MenuItem>
                  <MenuItem disabled={!canCreatePile} onClick={() => handleMenuAction('create-pile')}>Crea pila</MenuItem>
                  <MenuItem disabled={!playerHand || !selectedCardIds.length} onClick={() => { setMobileMoreOpen(false); void moveSelectedCardsToHand() }}>Prendi dal tavolo</MenuItem>
                  <MenuItem onClick={() => handleMenuAction('shuffle')}>Mescola mazzo</MenuItem>
                  <MenuItem disabled={deckCount === 0} onClick={() => handleMenuAction('deal')}>Distribuisci carte…</MenuItem>
                  <MenuItem onClick={() => handleMenuAction('move-deck')}>{isMovingDeck ? 'Annulla spostamento' : 'Sposta mazzo'}</MenuItem>
                  <MenuItem disabled={!canShowHand || players.length < 2} onClick={() => handleMenuAction('show-hand-all')}>Mostra tutta la mano</MenuItem>
                  <MenuItem disabled={!canShowSelected || players.length < 2} onClick={() => handleMenuAction('show-hand-selected')}>Mostra selezionate</MenuItem>
                  <MenuItem disabled={!isShowingHand} onClick={() => handleMenuAction('hide-hand')}>Nascondi carte mostrate</MenuItem>
                  <MenuItem destructive disabled={!isHost} onClick={() => handleMenuAction('reset')}>{confirmingReset ? 'Conferma azzeramento' : 'Azzera tavolo'}</MenuItem>
                  <MenuItem onClick={() => { closeActionMenu(); onBackHome?.() }}>Abbandona stanza</MenuItem>
                  {isHost && <MenuItem destructive onClick={() => { closeActionMenu(); onDeleteRoom?.() }}>Elimina stanza per tutti…</MenuItem>}
                </div>
                <div className="mt-3 border-t border-white/10 pt-2 text-[11px] text-ivory/70">
                  <strong>Giocatori</strong> · {players.map((player) => `${player.name}${player.isHost ? ' (host)' : ''}`).join(', ')}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>

        {dealingOpen && (
          <DealCardsDialog players={players} deckCount={deckCount} onDeal={dealCards} onClose={() => setDealingOpen(false)} />
        )}

        {revealDialogMode && (
          <RevealHandDialog mode={revealDialogMode} players={players.filter((player) => player.id !== currentPlayerId)} selectedCount={selectedHandCardIds.length} onClose={() => setRevealDialogMode(null)} onConfirm={async (recipientIds) => {
              const ok = revealDialogMode === 'all'
                ? await revealEntireHand(recipientIds)
                : await revealSelectedHandCards(selectedHandCardIds, recipientIds)
              if (ok) notify('Mano condivisa con i giocatori selezionati')
              return ok
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
      className="rounded-xl bg-black/65 px-3 py-1.5 text-center text-xs leading-snug text-ivory/90 shadow-[0_6px_18px_rgba(0,0,0,0.25)] backdrop-blur-sm sm:rounded-full sm:px-4 sm:text-sm"
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


function TouchAction({ children, onClick, disabled = false, active = false }: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`min-h-11 shrink-0 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-30 ${active
        ? 'border-gold bg-gold/20 text-ivory'
        : 'border-ivory/20 bg-white/5 text-ivory/90 active:bg-white/20'}`}
    >
      {children}
    </button>
  )
}
