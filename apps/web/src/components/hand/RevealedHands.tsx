import type { Hand } from '../../types/hand'
import type { Player } from '../../types/player'
import { isRedSuit } from '../../utils/suits'

export function RevealedHands({ hands, players, selfId }: { hands: Hand[]; players: Player[]; selfId: string }) {
  const sharing = hands.filter((hand) => hand.playerId !== selfId && hand.cards.some((card) => card.rank && card.suit))
  if (!sharing.length) return null

  return (
    <aside aria-label="Cards revealed by other players" className="pointer-events-auto absolute top-[8.5rem] right-3 left-3 z-30 max-h-[8.5rem] space-y-2 overflow-y-auto sm:top-[5.5rem] sm:right-auto sm:left-8 sm:max-h-[14rem] sm:max-w-[min(35rem,75vw)]">
      {sharing.map((hand) => {
        const shown = hand.cards.filter((card) => card.rank && card.suit)
        const hiddenCount = hand.cards.length - shown.length
        const name = players.find((player) => player.id === hand.playerId)?.name ?? 'Player'
        return (
          <div key={hand.id} className="max-w-full rounded-lg border border-white/15 bg-black/50 p-2 shadow-xl backdrop-blur-sm">
            <div className="mb-2 text-xs font-medium text-ivory/85">{name} is showing {shown.length} {shown.length === 1 ? 'card' : 'cards'}{hiddenCount ? ` · ${hiddenCount} hidden` : ''}</div>
            <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
              {shown.map((card) => (
                <div key={card.id} className={`flex h-14 w-10 shrink-0 flex-col items-center justify-center rounded border border-ivory/50 bg-ivory text-ink shadow-md ${isRedSuit(card.suit ?? '') ? 'text-suit-red' : 'text-suit-black'}`}>
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
