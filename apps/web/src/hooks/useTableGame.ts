import { useState, useRef } from 'react'
import { initialDeck } from '../data/initialTable'
import type { NormalizedPosition } from '../types/position'
import { shuffle } from '../utils/shuffle'
import type { LooseCard, TableCard } from '../types/card'
import type { Pile } from '../types/pile'
import type { Hand } from '../types/hand'
import type { Zone } from '../types/zone'

export function useTableGame() {
    const [deck, setDeck] = useState(() => shuffle(initialDeck))
    const [looseCards, setLooseCards] = useState<LooseCard[]>([])
    const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])
    const [piles, setPiles] = useState<Pile[]>([])
    const [hands, setHands] = useState<Hand[]>([{ id: 'player-1-hand', playerId: 'player-1', cards: [], }])
    const [zones, setZones] = useState<Zone[]>([{ id: 'discard-zone', label: 'Discard', type: 'discard', cards: [] }])

    const zIndexCounter = useRef(0)

    function getNextZIndex() {
        zIndexCounter.current += 1
        return zIndexCounter.current
    }

    const selectCard = (cardId: string, additive = false) => {
        setSelectedCardIds((currentIds) => {
            if (!additive) {
                if (currentIds.includes(cardId)) {
                    return currentIds
                }
                return [cardId]
            }

            if (currentIds.includes(cardId)) {
                return currentIds.filter((id) => id !== cardId)
            }

            return [...currentIds, cardId]
        })
    }

    const clearSelection = () => {
        setSelectedCardIds([])
    }

    const selectOnlyCard = (cardId: string) => {
        setSelectedCardIds((currentIds) =>
            currentIds.length === 1 && currentIds[0] === cardId ? currentIds : [cardId]
        )
    }

    function updateLooseCardPosition(cardId: string, position: NormalizedPosition,) {
        setLooseCards(currentCards =>
            currentCards.map(card =>
                card.id === cardId ? { ...card, position } : card
            )
        )
    }

    function moveLooseCardOrAddToPile(cardId: string, position: NormalizedPosition) {
        const card = looseCards.find(
            (currentCard) => currentCard.id === cardId
        )

        if (!card) return

        const dropThreshold = 0.08

        const targetPile = piles.find((pile) => {
            const deltaX = Math.abs(position.x - pile.position.x)

            const deltaY = Math.abs(position.y - pile.position.y)

            return (deltaX <= dropThreshold && deltaY <= dropThreshold)
        })

        if (!targetPile) {
            updateLooseCardPosition(cardId, position)
            return
        }

        const nextZIndex = getNextZIndex()

        const cardInsidePile = toTableCard(card)

        setPiles((currentPiles) =>
            currentPiles.map((pile) =>
                pile.id === targetPile.id
                    ? {
                        ...pile,
                        cards: [
                            ...pile.cards,
                            cardInsidePile,
                        ],
                        zIndex: nextZIndex,
                    }
                    : pile
            )
        )

        setLooseCards((currentCards) => currentCards.filter((currentCard) => currentCard.id !== cardId))

        setSelectedCardIds((currentIds) => currentIds.filter((currentId) => currentId !== cardId))
    }

    function moveSelectedCardsOrAddToPile(draggedCardId: string, position: NormalizedPosition) {
        const selectedCards = looseCards.filter((card) =>
            selectedCardIds.includes(card.id)
        ).sort((a, b) => a.zIndex - b.zIndex)

        if (selectedCards.length < 2) {
            moveLooseCardOrAddToPile(draggedCardId, position)
            return
        }

        const dropThreshold = 0.08

        const targetPile = piles.find((pile) => {
            const deltaX = Math.abs(
                position.x - pile.position.x
            )

            const deltaY = Math.abs(
                position.y - pile.position.y
            )

            return (
                deltaX <= dropThreshold &&
                deltaY <= dropThreshold
            )
        })

        if (!targetPile) {
            // The other selected cards already followed the drag; only the dragged one needs committing.
            updateLooseCardPosition(draggedCardId, position)

            return
        }

        const cardsInsidePile = selectedCards.map(toTableCard)

        setPiles((currentPiles) =>
            currentPiles.map((pile) =>
                pile.id === targetPile.id
                    ? {
                        ...pile,
                        cards: [
                            ...pile.cards,
                            ...cardsInsidePile,
                        ]
                    }
                    : pile
            )
        )

        setLooseCards((currentCards) =>
            currentCards.filter(
                (card) => !selectedCardIds.includes(card.id)
            )
        )

        setSelectedCardIds([])
    }

    function bringLooseCardToFront(cardId: string) {
        const nextZIndex = getNextZIndex()

        setLooseCards((currentCards) =>
            currentCards.map((card) => card.id === cardId ? { ...card, zIndex: nextZIndex } : card)
        )
    }

    function resetGame() {
        setLooseCards([])
        setPiles([])
        setSelectedCardIds([])
        setDeck(shuffle(initialDeck))
        setHands((currentHands) => currentHands.map((hand) => ({ ...hand, cards: [] })))
        setZones((currentZones) => currentZones.map((zone) => ({ ...zone, cards: [] })))

        zIndexCounter.current = 0
    }

    function drawCard(landingPosition: NormalizedPosition, spawnFrom?: NormalizedPosition) {
        //assegna a drawncard il primo elemento di deck e il resto lo mette in remaingDeck
        const [drawnCard, ...remainingDeck] = deck

        if (!drawnCard) return

        const offset = (looseCards.length % 3) * 0.02

        const cardWithOffset: LooseCard = {
            ...drawnCard,
            position: {
                x: Math.min(0.96, Math.max(0.04, landingPosition.x + offset)),
                y: Math.min(0.92, Math.max(0.08, landingPosition.y + offset)),
            },
            spawnFrom,
            zIndex: getNextZIndex(),
            faceUp: true
        }
        setDeck(remainingDeck)
        setLooseCards(currentCards => [...currentCards, cardWithOffset])
    }

    function drawCardToHand(handId: string) {
        const handExists = hands.some((hand) => hand.id === handId)

        if (!handExists || deck.length === 0) return

        const [drawnCard, ...remainingDeck] = deck

        const cardForHand: TableCard = {
            ...drawnCard,
            faceUp: true,
        }

        setDeck(remainingDeck)

        setHands((currentHands) =>
            currentHands.map((hand) =>
                hand.id === handId
                    ? {
                        ...hand,
                        cards: [
                            ...hand.cards,
                            cardForHand,
                        ],
                    }
                    : hand
            )
        )
    }

    function shuffleDeck() {
        setDeck(currentDeck => shuffle(currentDeck))
    }

    const flipCard = (cardId: string) => {
        setLooseCards((currentCards) =>
            currentCards.map((card) =>
                card.id === cardId ? { ...card, faceUp: !card.faceUp } : card
            )
        )
    }

    function moveSelectedCards(draggedCardId: string, delta: NormalizedPosition) {
        if (!selectedCardIds.includes(draggedCardId)) {
            return
        }

        setLooseCards(currentCards =>
            currentCards.map(card => {
                if (card.id === draggedCardId || !selectedCardIds.includes(card.id)) {
                    return card
                }

                return {
                    ...card,
                    position: {
                        x: Math.min(
                            1,
                            Math.max(0, card.position.x + delta.x)
                        ),
                        y: Math.min(
                            1,
                            Math.max(0, card.position.y + delta.y)
                        ),
                    },
                }
            })
        )
    }

    const createPileFromSelection = () => {
        if (selectedCardIds.length < 2) {
            return
        }

        const selectedCards = looseCards.filter((card) =>
            selectedCardIds.includes(card.id)
        ).sort((a, b) => a.zIndex - b.zIndex)

        if (selectedCards.length < 2) {
            return
        }

        const topCard = selectedCards.reduce((highest, card) =>
            card.zIndex > highest.zIndex ? card : highest
        )

        const cardsForPile = selectedCards.map(toTableCard)

        const newPile: Pile = {
            id: crypto.randomUUID(),
            cards: cardsForPile,
            position: topCard.position,
            zIndex: getNextZIndex(),
        }

        setPiles((currentPiles) => [
            ...currentPiles,
            newPile,
        ])

        setLooseCards((currentCards) =>
            currentCards.filter(
                (card) => !selectedCardIds.includes(card.id)
            )
        )

        setSelectedCardIds([])
    }

    function updatePilePosition(pileId: string, position: NormalizedPosition) {
        setPiles((currentPiles) =>
            currentPiles.map((pile) => pile.id === pileId ? { ...pile, position } : pile)
        )
    }

    function bringPileToFront(pileId: string) {
        const nextZIndex = getNextZIndex()

        setPiles((currentPiles) =>
            currentPiles.map((pile) => pile.id === pileId ? { ...pile, zIndex: nextZIndex } : pile)
        )
    }

    function extractTopCardFromPile(pileId: string) {
        const pile = piles.find((currentPile) => currentPile.id === pileId)

        if (!pile || pile.cards.length === 0) {
            return
        }

        const topCard = pile.cards[pile.cards.length - 1]
        const remainingCards = pile.cards.slice(0, -1)

        const extractedCard: LooseCard = {
            ...topCard,
            position: {
                x: Math.min(0.96, pile.position.x + 0.06),
                y: Math.min(0.92, pile.position.y + 0.04),
            },
            spawnFrom: pile.position,
            zIndex: getNextZIndex(),
        }

        setLooseCards((currentCards) => [
            ...currentCards,
            extractedCard,
        ])

        setPiles((currentPiles) =>
            currentPiles
                .map((currentPile) => {
                    if (currentPile.id !== pileId) {
                        return currentPile
                    }

                    return {
                        ...currentPile,
                        cards: remainingCards,
                    }
                })
                .filter((currentPile) => currentPile.cards.length > 0)
        )
    }

    function toTableCard(card: LooseCard): TableCard {
        return {
            id: card.id,
            rank: card.rank,
            suit: card.suit,
            faceUp: card.faceUp,
        }
    }

    function playCardFromHand(handId: string, cardId: string, position: NormalizedPosition) {
        const hand = hands.find(
            (currentHand) => currentHand.id === handId
        )

        if (!hand) return

        const card = hand.cards.find(
            (currentCard) => currentCard.id === cardId
        )

        if (!card) return

        const looseCard: LooseCard = {
            ...card,
            position,
            zIndex: getNextZIndex(),
        }

        setHands((currentHands) =>
            currentHands.map((currentHand) =>
                currentHand.id === handId
                    ? {
                        ...currentHand,
                        cards: currentHand.cards.filter(
                            (currentCard) =>
                                currentCard.id !== cardId
                        ),
                    }
                    : currentHand
            )
        )

        setLooseCards((currentCards) => [
            ...currentCards,
            looseCard,
        ])
    }

    function moveLooseCardToHand(
        cardId: string,
        handId: string
    ) {
        const card = looseCards.find(
            (currentCard) => currentCard.id === cardId
        )

        if (!card) return

        const handExists = hands.some(
            (hand) => hand.id === handId
        )

        if (!handExists) return

        const cardForHand = toTableCard(card)

        setHands((currentHands) =>
            currentHands.map((hand) =>
                hand.id === handId
                    ? {
                        ...hand,
                        cards: [
                            ...hand.cards,
                            cardForHand,
                        ],
                    }
                    : hand
            )
        )

        setLooseCards((currentCards) =>
            currentCards.filter(
                (currentCard) =>
                    currentCard.id !== cardId
            )
        )

        setSelectedCardIds((currentIds) =>
            currentIds.filter(
                (currentId) =>
                    currentId !== cardId
            )
        )
    }

    function moveLooseCardToZone(
        cardId: string,
        zoneId: string
    ) {
        const card = looseCards.find(
            (currentCard) =>
                currentCard.id === cardId
        )

        if (!card) return

        const zoneExists = zones.some(
            (zone) =>
                zone.id === zoneId
        )

        if (!zoneExists) return

        const cardForZone = toTableCard(card)

        setZones((currentZones) =>
            currentZones.map((zone) =>
                zone.id === zoneId
                    ? {
                        ...zone,
                        cards: [
                            ...zone.cards,
                            cardForZone,
                        ],
                    }
                    : zone
            )
        )

        setLooseCards((currentCards) =>
            currentCards.filter(
                (currentCard) =>
                    currentCard.id !== cardId
            )
        )

        setSelectedCardIds((currentIds) =>
            currentIds.filter(
                (currentId) =>
                    currentId !== cardId
            )
        )
    }

    function moveCardFromHandToZone(
        handId: string,
        cardId: string,
        zoneId: string
    ) {
        const hand = hands.find(
            (currentHand) => currentHand.id === handId
        )

        if (!hand) return

        const card = hand.cards.find(
            (currentCard) => currentCard.id === cardId
        )

        if (!card) return

        const zoneExists = zones.some(
            (zone) => zone.id === zoneId
        )

        if (!zoneExists) return

        setHands((currentHands) =>
            currentHands.map((currentHand) =>
                currentHand.id === handId
                    ? {
                        ...currentHand,
                        cards: currentHand.cards.filter(
                            (currentCard) =>
                                currentCard.id !== cardId
                        ),
                    }
                    : currentHand
            )
        )

        setZones((currentZones) =>
            currentZones.map((zone) =>
                zone.id === zoneId
                    ? {
                        ...zone,
                        cards: [
                            ...zone.cards,
                            card,
                        ],
                    }
                    : zone
            )
        )
    }

    function extractTopCardFromZone(
        zoneId: string,
        position: NormalizedPosition
    ) {
        const zone = zones.find(
            (currentZone) => currentZone.id === zoneId
        )

        if (!zone || zone.cards.length === 0) {
            return
        }

        const topCard =
            zone.cards[zone.cards.length - 1]

        const remainingCards =
            zone.cards.slice(0, -1)

        const looseCard: LooseCard = {
            ...topCard,
            position,
            zIndex: getNextZIndex(),
        }

        setZones((currentZones) =>
            currentZones.map((currentZone) =>
                currentZone.id === zoneId
                    ? {
                        ...currentZone,
                        cards: remainingCards,
                    }
                    : currentZone
            )
        )

        setLooseCards((currentCards) => [
            ...currentCards,
            looseCard,
        ])
    }

    return {
        deck,
        looseCards,
        piles,
        selectedCardIds,
        hands,
        zones,
        drawCard,
        shuffleDeck,
        resetGame,
        updateLooseCardPosition,
        bringLooseCardToFront,
        flipCard,
        selectCard,
        selectOnlyCard,
        clearSelection,
        moveSelectedCards,
        createPileFromSelection,
        updatePilePosition,
        bringPileToFront,
        extractTopCardFromPile,
        moveLooseCardOrAddToPile,
        moveSelectedCardsOrAddToPile,
        drawCardToHand,
        playCardFromHand,
        moveLooseCardToHand,
        moveLooseCardToZone,
        moveCardFromHandToZone,
        extractTopCardFromZone,
    }
}