import { useRef, useState } from 'react'
import { socket } from '../multiplayer/socket'
import type { TableGameState } from '../types/game'
import type { NormalizedPosition } from '../types/position'

// The server owns all cards. This hook only keeps a VIEW of the state and
// local-only UI selection/drag previews. No card may be created here.
type Action = { type: string;[key: string]: unknown }
const clamp = (value: number) => Math.max(0, Math.min(1, value))

export function useTableGame(initial: TableGameState, onError: (message: string) => void) {
  const [game, setGame] = useState(initial)
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])
  const [dragOffset, setDragOffset] = useState<NormalizedPosition>({ x: 0, y: 0 })
  const offsetRef = useRef<NormalizedPosition>({ x: 0, y: 0 })
  const draggedRef = useRef<string | null>(null)

  const request = (action: Action) => {
    if (!socket.connected) {
      onError('Connection lost. Your action was not sent.')
      return
    }
    socket.timeout(5000).emit('table:action', { ...action, actionId: crypto.randomUUID() }, (error: Error | null, response?: { ok: boolean; error?: string }) => {
      if (error) onError('Server did not respond. Check your connection.')
      else if (!response?.ok) onError(response?.error ?? 'Action rejected by server.')
    })
  }

  const replaceGameState = (next: TableGameState) => {
    setGame((current) => next.version >= current.version ? next : current)
    setSelectedCardIds((current) => {
      const existing = new Set(next.looseCards.map((card) => card.id))
      return current.filter((id) => existing.has(id))
    })
    offsetRef.current = { x: 0, y: 0 }
    draggedRef.current = null
    setDragOffset({ x: 0, y: 0 })
  }

  const selectCard = (id: string, additive = false) => setSelectedCardIds((current) => additive
    ? current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    : current.includes(id) ? current : [id])
  const selectOnlyCard = (id: string) => setSelectedCardIds((current) => current.length === 1 && current[0] === id ? current : [id])
  const clearSelection = () => setSelectedCardIds([])

  const moveSelectedCards = (draggedCardId: string, delta: NormalizedPosition) => {
    if (selectedCardIds.length < 2 || !selectedCardIds.includes(draggedCardId)) return
    draggedRef.current = draggedCardId
    offsetRef.current = { x: offsetRef.current.x + delta.x, y: offsetRef.current.y + delta.y }
    setDragOffset(offsetRef.current)
  }

  const commitMovement = (draggedId: string, position: NormalizedPosition, selected: boolean) => {
    const moving = selected && selectedCardIds.includes(draggedId)
      ? game.looseCards.filter((card) => selectedCardIds.includes(card.id))
      : game.looseCards.filter((card) => card.id === draggedId)
    if (!moving.length) return

    const moves = moving.map((card) => ({
      id: card.id,
      position: card.id === draggedId ? position : {
        x: clamp(card.position.x + offsetRef.current.x),
        y: clamp(card.position.y + offsetRef.current.y),
      },
    }))
    const pile = game.piles.find((pile) => Math.abs(pile.position.x - position.x) <= 0.08 && Math.abs(pile.position.y - position.y) <= 0.08)
    if (pile) request({ type: 'move-cards', pileId: pile.id, moves: moves.map((move) => ({ ...move, position: pile.position })) })
    else request({ type: 'move-cards', moves })
    offsetRef.current = { x: 0, y: 0 }
    draggedRef.current = null
    setDragOffset({ x: 0, y: 0 })
  }

  const tableToHand = (ids: string[]) => { request({ type: 'table-to-hand', cardIds: ids }); clearSelection() }
  const tableToZone = (ids: string[], zoneId: string) => { request({ type: 'table-to-zone', cardIds: ids, zoneId }); clearSelection() }

  return {
    deckCount: game.deckCount,
    deckPosition: game.deckPosition,
    looseCards: game.looseCards.map((card) => selectedCardIds.includes(card.id) && card.id !== draggedRef.current && (dragOffset.x !== 0 || dragOffset.y !== 0)
      ? { ...card, position: { x: clamp(card.position.x + dragOffset.x), y: clamp(card.position.y + dragOffset.y) } }
      : card),
    piles: game.piles,
    hands: game.hands,
    zones: game.zones,
    selectedCardIds,
    replaceGameState,
    selectCard,
    selectOnlyCard,
    clearSelection,
    moveSelectedCards,
    moveLooseCardOrAddToPile: (id: string, pos: NormalizedPosition) => commitMovement(id, pos, false),
    moveSelectedCardsOrAddToPile: (id: string, pos: NormalizedPosition) => commitMovement(id, pos, true),
    drawCard: (landingPosition: NormalizedPosition, spawnFrom?: NormalizedPosition) => request({ type: 'draw-table', landingPosition, spawnFrom }),
    drawCardToHand: () => request({ type: 'draw-hand' }),
    dealCards: (recipients: string[], cardsPerPlayer: number) => request({ type: 'deal', recipients, cardsPerPlayer }),
    revealEntireHand: (recipientIds: string[]) => request({type: 'reveal-hand',scope: 'all',recipientIds}),
    revealSelectedHandCards: (cardIds: string[],recipientIds: string[]) =>request({type: 'reveal-hand',scope: 'selected',cardIds,recipientIds,}),
    hideRevealedHandCards: () => request({ type: 'hide-hand' }),
    rotateSelectedCards: () => request({ type: 'rotate-cards', cardIds: selectedCardIds, degrees: 90 }),
    bringLooseCardToFront: (cardId: string) => request({ type: 'front-card', cardId }),
    flipCard: (cardId: string) => request({ type: 'flip-cards', cardIds: [cardId] }),
    flipSelectedCards: () => request({ type: 'flip-cards', cardIds: selectedCardIds }),
    createPileFromSelection: () => { if (selectedCardIds.length >= 2) request({ type: 'create-pile', cardIds: selectedCardIds }); clearSelection() },
    updatePilePosition: (pileId: string, position: NormalizedPosition) => request({ type: 'move-pile', pileId, position }),
    bringPileToFront: (pileId: string) => request({ type: 'front-pile', pileId }),
    rotatePile: (pileId: string) => request({ type: 'rotate-pile', pileId, degrees: 90 }),
    flipPile: (pileId: string) => request({ type: 'flip-pile', pileId }),
    shufflePile: (pileId: string) => request({ type: 'shuffle-pile', pileId }),
    extractTopCardFromPile: (pileId: string) => request({ type: 'extract-pile', pileId }),
    moveLooseCardToHand: (cardId: string) => tableToHand([cardId]),
    moveSelectedCardsToHand: () => tableToHand(selectedCardIds),
    playCardFromHand: (_handId: string, cardId: string, position: NormalizedPosition) => request({ type: 'hand-to-table', cardId, position }),
    moveLooseCardToZone: (cardId: string, zoneId: string) => tableToZone([cardId], zoneId),
    moveSelectedCardsToZone: (zoneId: string) => tableToZone(selectedCardIds, zoneId),
    moveCardFromHandToZone: (_handId: string, cardId: string, zoneId: string) => request({ type: 'hand-to-zone', cardId, zoneId }),
    extractTopCardFromZone: (zoneId: string, position: NormalizedPosition) => request({ type: 'extract-zone', zoneId, position }),
    shuffleDeck: () => request({ type: 'shuffle' }),
    resetGame: () => { request({ type: 'reset' }); clearSelection() },
    moveDeck: (position: NormalizedPosition) => request({ type: 'move-deck', position }),
  }
}
