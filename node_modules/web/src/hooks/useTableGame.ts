import { useRef, useState } from 'react'
import { initialDeck } from '../data/initialTable'
import type { LooseCard, TableCard } from '../types/card'
import type { TableGameState } from '../types/game'
import type { Pile } from '../types/pile'
import type { NormalizedPosition } from '../types/position'
import { shuffle } from '../utils/shuffle'

function createInitialGameState(): TableGameState {
    return {
        deck: shuffle(initialDeck),
        looseCards: [],
        piles: [],
        hands: [
            {
                id: 'player-1-hand',
                playerId: 'player-1',
                cards: [],
            },
        ],
        zones: [
            {
                id: 'discard-zone',
                label: 'Discard',
                type: 'discard',
                cards: [],
            },
        ],
    }
}

export function useTableGame(initialState?: TableGameState,) {
    const [game, setGame] = useState<TableGameState>(() => initialState ?? createInitialGameState())
    const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])

    const {
        deck,
        looseCards,
        piles,
        hands,
        zones,
    } = game

    const zIndexCounter = useRef(0)

    function replaceGameState(
        nextGame: TableGameState,
    ) {
        setGame(nextGame)
        setSelectedCardIds([])

        const highestZIndex = Math.max(
            0,
            ...nextGame.looseCards.map(
                (card) => card.zIndex,
            ),
            ...nextGame.piles.map(
                (pile) => pile.zIndex,
            ),
        )

        zIndexCounter.current = highestZIndex
    }

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
            currentIds.length === 1 && currentIds[0] === cardId
                ? currentIds
                : [cardId]
        )
    }

    function updateLooseCardPosition(
        cardId: string,
        position: NormalizedPosition
    ) {
        setGame((currentGame) => ({
            ...currentGame,
            looseCards: currentGame.looseCards.map((card) =>
                card.id === cardId
                    ? { ...card, position }
                    : card
            ),
        }))
    }

    function moveLooseCardOrAddToPile(
        cardId: string,
        position: NormalizedPosition
    ) {
        const card = looseCards.find(
            (currentCard) => currentCard.id === cardId
        )

        if (!card) return

        const dropThreshold = 0.08

        const targetPile = piles.find((pile) => {
            const deltaX = Math.abs(position.x - pile.position.x)
            const deltaY = Math.abs(position.y - pile.position.y)

            return deltaX <= dropThreshold && deltaY <= dropThreshold
        })

        if (!targetPile) {
            updateLooseCardPosition(cardId, position)
            return
        }

        const nextZIndex = getNextZIndex()
        const cardInsidePile = toTableCard(card)

        setGame((currentGame) => ({
            ...currentGame,

            piles: currentGame.piles.map((pile) =>
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
            ),

            looseCards: currentGame.looseCards.filter(
                (currentCard) =>
                    currentCard.id !== cardId
            ),
        }))

        setSelectedCardIds((currentIds) =>
            currentIds.filter(
                (currentId) => currentId !== cardId
            )
        )
    }

    function moveSelectedCardsOrAddToPile(
        draggedCardId: string,
        position: NormalizedPosition
    ) {
        const selectedCards = looseCards
            .filter((card) =>
                selectedCardIds.includes(card.id)
            )
            .sort((a, b) => a.zIndex - b.zIndex)

        if (selectedCards.length < 2) {
            moveLooseCardOrAddToPile(
                draggedCardId,
                position
            )

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
            // Le altre carte selezionate hanno già seguito il drag.
            // Qui confermiamo la posizione della carta trascinata.
            updateLooseCardPosition(
                draggedCardId,
                position
            )

            return
        }

        const cardsInsidePile =
            selectedCards.map(toTableCard)

        setGame((currentGame) => ({
            ...currentGame,

            piles: currentGame.piles.map((pile) =>
                pile.id === targetPile.id
                    ? {
                        ...pile,
                        cards: [
                            ...pile.cards,
                            ...cardsInsidePile,
                        ],
                    }
                    : pile
            ),

            looseCards:
                currentGame.looseCards.filter(
                    (card) =>
                        !selectedCardIds.includes(card.id)
                ),
        }))

        setSelectedCardIds([])
    }

    function bringLooseCardToFront(cardId: string) {
        const nextZIndex = getNextZIndex()

        setGame((currentGame) => ({
            ...currentGame,

            looseCards: currentGame.looseCards.map(
                (card) =>
                    card.id === cardId
                        ? {
                            ...card,
                            zIndex: nextZIndex,
                        }
                        : card
            ),
        }))
    }

    function resetGame() {
        setGame((currentGame) => ({
            ...currentGame,

            deck: shuffle(initialDeck),

            looseCards: [],

            piles: [],

            hands: currentGame.hands.map((hand) => ({
                ...hand,
                cards: [],
            })),

            zones: currentGame.zones.map((zone) => ({
                ...zone,
                cards: [],
            })),
        }))

        setSelectedCardIds([])

        zIndexCounter.current = 0
    }

    function drawCard(
        landingPosition: NormalizedPosition,
        spawnFrom?: NormalizedPosition
    ) {
        if (deck.length === 0) return

        const nextZIndex = getNextZIndex()

        setGame((currentGame) => {
            const [drawnCard, ...remainingDeck] =
                currentGame.deck

            if (!drawnCard) {
                return currentGame
            }

            const offset =
                (currentGame.looseCards.length % 3) *
                0.02

            const cardWithOffset: LooseCard = {
                ...drawnCard,

                position: {
                    x: Math.min(
                        0.96,
                        Math.max(
                            0.04,
                            landingPosition.x + offset
                        )
                    ),

                    y: Math.min(
                        0.92,
                        Math.max(
                            0.08,
                            landingPosition.y + offset
                        )
                    ),
                },

                spawnFrom,
                zIndex: nextZIndex,
                faceUp: true,
            }

            return {
                ...currentGame,

                deck: remainingDeck,

                looseCards: [
                    ...currentGame.looseCards,
                    cardWithOffset,
                ],
            }
        })
    }

    function drawCardToHand(handId: string) {
        const handExists = hands.some(
            (hand) => hand.id === handId
        )

        if (!handExists || deck.length === 0) {
            return
        }

        setGame((currentGame) => {
            const [drawnCard, ...remainingDeck] =
                currentGame.deck

            if (!drawnCard) {
                return currentGame
            }

            const currentHandExists =
                currentGame.hands.some(
                    (hand) => hand.id === handId
                )

            if (!currentHandExists) {
                return currentGame
            }

            const cardForHand: TableCard = {
                ...drawnCard,
                faceUp: true,
            }

            return {
                ...currentGame,

                deck: remainingDeck,

                hands: currentGame.hands.map(
                    (hand) =>
                        hand.id === handId
                            ? {
                                ...hand,

                                cards: [
                                    ...hand.cards,
                                    cardForHand,
                                ],
                            }
                            : hand
                ),
            }
        })
    }

    function shuffleDeck() {
        setGame((currentGame) => ({
            ...currentGame,
            deck: shuffle(currentGame.deck),
        }))
    }

    const flipCard = (cardId: string) => {
        setGame((currentGame) => ({
            ...currentGame,

            looseCards:
                currentGame.looseCards.map((card) =>
                    card.id === cardId
                        ? {
                            ...card,
                            faceUp: !card.faceUp,
                        }
                        : card
                ),
        }))
    }

    function moveSelectedCards(
        draggedCardId: string,
        delta: NormalizedPosition
    ) {
        if (
            !selectedCardIds.includes(draggedCardId)
        ) {
            return
        }

        setGame((currentGame) => ({
            ...currentGame,

            looseCards:
                currentGame.looseCards.map((card) => {
                    if (
                        card.id === draggedCardId ||
                        !selectedCardIds.includes(
                            card.id
                        )
                    ) {
                        return card
                    }

                    return {
                        ...card,

                        position: {
                            x: Math.min(
                                1,
                                Math.max(
                                    0,
                                    card.position.x +
                                    delta.x
                                )
                            ),

                            y: Math.min(
                                1,
                                Math.max(
                                    0,
                                    card.position.y +
                                    delta.y
                                )
                            ),
                        },
                    }
                }),
        }))
    }

    const createPileFromSelection = () => {
        if (selectedCardIds.length < 2) {
            return
        }

        const selectedCards = looseCards
            .filter((card) =>
                selectedCardIds.includes(card.id)
            )
            .sort((a, b) => a.zIndex - b.zIndex)

        if (selectedCards.length < 2) {
            return
        }

        const topCard = selectedCards.reduce(
            (highest, card) =>
                card.zIndex > highest.zIndex
                    ? card
                    : highest
        )

        const newPile: Pile = {
            id: crypto.randomUUID(),

            cards:
                selectedCards.map(toTableCard),

            position: topCard.position,

            zIndex: getNextZIndex(),
        }

        setGame((currentGame) => ({
            ...currentGame,

            piles: [
                ...currentGame.piles,
                newPile,
            ],

            looseCards:
                currentGame.looseCards.filter(
                    (card) =>
                        !selectedCardIds.includes(
                            card.id
                        )
                ),
        }))

        setSelectedCardIds([])
    }

    function updatePilePosition(
        pileId: string,
        position: NormalizedPosition
    ) {
        setGame((currentGame) => ({
            ...currentGame,

            piles: currentGame.piles.map((pile) =>
                pile.id === pileId
                    ? {
                        ...pile,
                        position,
                    }
                    : pile
            ),
        }))
    }

    function bringPileToFront(pileId: string) {
        const nextZIndex = getNextZIndex()

        setGame((currentGame) => ({
            ...currentGame,

            piles: currentGame.piles.map((pile) =>
                pile.id === pileId
                    ? {
                        ...pile,
                        zIndex: nextZIndex,
                    }
                    : pile
            ),
        }))
    }

    function extractTopCardFromPile(
        pileId: string
    ) {
        const pile = piles.find(
            (currentPile) =>
                currentPile.id === pileId
        )

        if (
            !pile ||
            pile.cards.length === 0
        ) {
            return
        }

        const nextZIndex = getNextZIndex()

        setGame((currentGame) => {
            const currentPile =
                currentGame.piles.find(
                    (pile) =>
                        pile.id === pileId
                )

            if (
                !currentPile ||
                currentPile.cards.length === 0
            ) {
                return currentGame
            }

            const topCard =
                currentPile.cards[
                currentPile.cards.length - 1
                ]

            const remainingCards =
                currentPile.cards.slice(0, -1)

            const extractedCard: LooseCard = {
                ...topCard,

                position: {
                    x: Math.min(
                        0.96,
                        currentPile.position.x + 0.06
                    ),

                    y: Math.min(
                        0.92,
                        currentPile.position.y + 0.04
                    ),
                },

                spawnFrom: currentPile.position,

                zIndex: nextZIndex,
            }

            return {
                ...currentGame,

                looseCards: [
                    ...currentGame.looseCards,
                    extractedCard,
                ],

                piles: currentGame.piles
                    .map((pile) =>
                        pile.id === pileId
                            ? {
                                ...pile,
                                cards:
                                    remainingCards,
                            }
                            : pile
                    )
                    .filter(
                        (pile) =>
                            pile.cards.length > 0
                    ),
            }
        })
    }

    function toTableCard(
        card: LooseCard
    ): TableCard {
        return {
            id: card.id,
            rank: card.rank,
            suit: card.suit,
            faceUp: card.faceUp,
        }
    }

    function playCardFromHand(
        handId: string,
        cardId: string,
        position: NormalizedPosition
    ) {
        const hand = hands.find(
            (currentHand) =>
                currentHand.id === handId
        )

        if (!hand) return

        const card = hand.cards.find(
            (currentCard) =>
                currentCard.id === cardId
        )

        if (!card) return

        const nextZIndex = getNextZIndex()

        setGame((currentGame) => {
            const currentHand =
                currentGame.hands.find(
                    (hand) =>
                        hand.id === handId
                )

            const currentCard =
                currentHand?.cards.find(
                    (handCard) =>
                        handCard.id === cardId
                )

            if (!currentCard) {
                return currentGame
            }

            const looseCard: LooseCard = {
                ...currentCard,
                position,
                zIndex: nextZIndex,
            }

            return {
                ...currentGame,

                hands: currentGame.hands.map(
                    (hand) =>
                        hand.id === handId
                            ? {
                                ...hand,

                                cards:
                                    hand.cards.filter(
                                        (handCard) =>
                                            handCard.id !==
                                            cardId
                                    ),
                            }
                            : hand
                ),

                looseCards: [
                    ...currentGame.looseCards,
                    looseCard,
                ],
            }
        })
    }

    function moveLooseCardToHand(
        cardId: string,
        handId: string
    ) {
        const card = looseCards.find(
            (currentCard) =>
                currentCard.id === cardId
        )

        const handExists = hands.some(
            (hand) =>
                hand.id === handId
        )

        if (!card || !handExists) {
            return
        }

        setGame((currentGame) => {
            const currentCard =
                currentGame.looseCards.find(
                    (looseCard) =>
                        looseCard.id === cardId
                )

            const currentHandExists =
                currentGame.hands.some(
                    (hand) =>
                        hand.id === handId
                )

            if (
                !currentCard ||
                !currentHandExists
            ) {
                return currentGame
            }

            const cardForHand =
                toTableCard(currentCard)

            return {
                ...currentGame,

                hands: currentGame.hands.map(
                    (hand) =>
                        hand.id === handId
                            ? {
                                ...hand,

                                cards: [
                                    ...hand.cards,
                                    cardForHand,
                                ],
                            }
                            : hand
                ),

                looseCards:
                    currentGame.looseCards.filter(
                        (looseCard) =>
                            looseCard.id !== cardId
                    ),
            }
        })

        setSelectedCardIds((currentIds) =>
            currentIds.filter(
                (currentId) =>
                    currentId !== cardId
            )
        )
    }

    function moveSelectedCardsToZone(zoneId: string) {
        if (selectedCardIds.length < 2) {
            return
        }

        setGame((currentGame) => {
            const zoneExists = currentGame.zones.some(
                (zone) => zone.id === zoneId
            )

            if (!zoneExists) {
                return currentGame
            }

            const selectedCards = currentGame.looseCards
                .filter((card) =>
                    selectedCardIds.includes(card.id)
                )
                .sort((a, b) => a.zIndex - b.zIndex)

            if (selectedCards.length < 2) {
                return currentGame
            }

            const selectedIds = new Set(
                selectedCards.map((card) => card.id)
            )

            return {
                ...currentGame,

                zones: currentGame.zones.map((zone) =>
                    zone.id === zoneId
                        ? {
                            ...zone,
                            cards: [
                                ...zone.cards,
                                ...selectedCards.map(toTableCard),
                            ],
                        }
                        : zone
                ),

                looseCards: currentGame.looseCards.filter(
                    (card) => !selectedIds.has(card.id)
                ),
            }
        })

        setSelectedCardIds([])
    }

    function moveSelectedCardsToHand(handId: string) {
        if (selectedCardIds.length < 2) {
            return
        }

        setGame((currentGame) => {
            const handExists = currentGame.hands.some(
                (hand) => hand.id === handId
            )

            if (!handExists) {
                return currentGame
            }

            const selectedCards = currentGame.looseCards
                .filter((card) =>
                    selectedCardIds.includes(card.id)
                )
                .sort((a, b) => a.zIndex - b.zIndex)

            if (selectedCards.length < 2) {
                return currentGame
            }

            const selectedIds = new Set(
                selectedCards.map((card) => card.id)
            )

            return {
                ...currentGame,

                hands: currentGame.hands.map((hand) =>
                    hand.id === handId
                        ? {
                            ...hand,
                            cards: [
                                ...hand.cards,
                                ...selectedCards.map(toTableCard),
                            ],
                        }
                        : hand
                ),

                looseCards: currentGame.looseCards.filter(
                    (card) => !selectedIds.has(card.id)
                ),
            }
        })

        setSelectedCardIds([])
    }

    function moveLooseCardToZone(
        cardId: string,
        zoneId: string
    ) {
        const card = looseCards.find(
            (currentCard) =>
                currentCard.id === cardId
        )

        const zoneExists = zones.some(
            (zone) =>
                zone.id === zoneId
        )

        if (!card || !zoneExists) {
            return
        }

        setGame((currentGame) => {
            const currentCard =
                currentGame.looseCards.find(
                    (looseCard) =>
                        looseCard.id === cardId
                )

            const currentZoneExists =
                currentGame.zones.some(
                    (zone) =>
                        zone.id === zoneId
                )

            if (
                !currentCard ||
                !currentZoneExists
            ) {
                return currentGame
            }

            const cardForZone =
                toTableCard(currentCard)

            return {
                ...currentGame,

                zones: currentGame.zones.map(
                    (zone) =>
                        zone.id === zoneId
                            ? {
                                ...zone,

                                cards: [
                                    ...zone.cards,
                                    cardForZone,
                                ],
                            }
                            : zone
                ),

                looseCards:
                    currentGame.looseCards.filter(
                        (looseCard) =>
                            looseCard.id !== cardId
                    ),
            }
        })

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
            (currentHand) =>
                currentHand.id === handId
        )

        const card = hand?.cards.find(
            (currentCard) =>
                currentCard.id === cardId
        )

        const zoneExists = zones.some(
            (zone) =>
                zone.id === zoneId
        )

        if (!card || !zoneExists) {
            return
        }

        setGame((currentGame) => {
            const currentHand =
                currentGame.hands.find(
                    (currentHand) =>
                        currentHand.id === handId
                )

            const currentCard =
                currentHand?.cards.find(
                    (handCard) =>
                        handCard.id === cardId
                )

            const currentZoneExists =
                currentGame.zones.some(
                    (zone) =>
                        zone.id === zoneId
                )

            if (
                !currentCard ||
                !currentZoneExists
            ) {
                return currentGame
            }

            return {
                ...currentGame,

                hands: currentGame.hands.map(
                    (currentHand) =>
                        currentHand.id === handId
                            ? {
                                ...currentHand,

                                cards:
                                    currentHand.cards.filter(
                                        (handCard) =>
                                            handCard.id !==
                                            cardId
                                    ),
                            }
                            : currentHand
                ),

                zones: currentGame.zones.map(
                    (zone) =>
                        zone.id === zoneId
                            ? {
                                ...zone,

                                cards: [
                                    ...zone.cards,
                                    currentCard,
                                ],
                            }
                            : zone
                ),
            }
        })
    }

    function extractTopCardFromZone(
        zoneId: string,
        position: NormalizedPosition
    ) {
        const zone = zones.find(
            (currentZone) =>
                currentZone.id === zoneId
        )

        if (
            !zone ||
            zone.cards.length === 0
        ) {
            return
        }

        const nextZIndex = getNextZIndex()

        setGame((currentGame) => {
            const currentZone =
                currentGame.zones.find(
                    (zone) =>
                        zone.id === zoneId
                )

            if (
                !currentZone ||
                currentZone.cards.length === 0
            ) {
                return currentGame
            }

            const topCard =
                currentZone.cards[
                currentZone.cards.length - 1
                ]

            const remainingCards =
                currentZone.cards.slice(0, -1)

            const looseCard: LooseCard = {
                ...topCard,
                position,
                zIndex: nextZIndex,
            }

            return {
                ...currentGame,

                zones: currentGame.zones.map(
                    (zone) =>
                        zone.id === zoneId
                            ? {
                                ...zone,
                                cards:
                                    remainingCards,
                            }
                            : zone
                ),

                looseCards: [
                    ...currentGame.looseCards,
                    looseCard,
                ],
            }
        })
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
        replaceGameState,

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
        moveSelectedCardsToZone,
        moveCardFromHandToZone,
        extractTopCardFromZone,
        moveSelectedCardsToHand,
    }
}