import { isRedSuit } from '../../utils/suits'
import type { Hand } from '../../types/hand'
import type { Player } from '../../types/player'

export function RevealedHands({ hands, players, selfId }: { hands: Hand[]; players: Player[]; selfId: string }) {
  const sharing = hands.filter((hand) => hand.playerId !== selfId && hand.cards.some((card) => card.rank && card.suit))
  if (!sharing.length) return null

  return (
    <aside aria-label="Cards revealed by other players" className="pointer-events-auto absolute top-[4.5rem] left-5 z-30 max-w-[min(35rem,75vw)] space-y-2 md:left-8">
      {sharing.map((hand) => {
        const shown = hand.cards.filter((card) => card.rank && card.suit)
        const hiddenCount = hand.cards.length - shown.length
        const name = players.find((player) => player.id === hand.playerId)?.name ?? 'Player'
        return (
          <div key={hand.id} className="max-w-full rounded-lg border border-white/15 bg-black/50 p-2 shadow-xl backdrop-blur-sm">
            <div className="mb-2 text-xs font-medium text-ivory/85">{name} is showing {shown.length} {shown.length === 1 ? 'card' : 'cards'}{hiddenCount ? ` · ${hiddenCount} hidden` : ''}</div>
            <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
              {shown.map((card) => (
                <div key={card.id} className={`flex h-14 w-10 shrink-0 flex-col items-center justify-center rounded border border-ivory/50 bg-ivory shadow-md ${isRedSuit(card.suit ?? '') ? 'text-suit-red' : 'text-suit-black'}`}>
                  <span className="font-display text-sm leading-none font-bold">{card.rank}</span>
                  <span className="mt-1 text-[10px] leading-none">{card.suit}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </aside>
  )
}
