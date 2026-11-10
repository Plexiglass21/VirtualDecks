import { useState } from 'react'
import type { Player } from '../../types/player'

export function DealCardsDialog({ players, deckCount, onDeal, onClose }: {
  players: Player[]
  deckCount: number
  onDeal: (recipients: string[], cardsPerPlayer: number) => Promise<boolean>
  onClose: () => void
}) {
  const [recipients, setRecipients] = useState<string[]>(players.filter((player) => player.online).map((player) => player.id))
  const [countInput, setCountInput] = useState('1')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const count = Number(countInput)
  const valid = recipients.length > 0 && Number.isInteger(count) && count > 0 && count <= 52 && recipients.length * count <= deckCount

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 px-3 py-4 backdrop-blur-sm" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Deal cards" className="max-h-[calc(100dvh-2rem)] w-[min(26rem,100%)] space-y-4 overflow-y-auto rounded-xl border border-white/10 bg-[#161816] p-4 text-ivory sm:p-6 shadow-2xl">
        <div>
          <h2 className="font-display text-2xl font-semibold">Deal cards</h2>
          <p className="mt-1 text-sm text-ivory/60">Deal from the deck, one card at a time, to each chosen player.</p>
        </div>
        <label className="block text-sm text-ivory/90">
          Cards per player
          <input type="number" min="1" max="52" inputMode="numeric" value={countInput} onChange={(event) => setCountInput(event.target.value)} className="mt-2 block h-10 w-full rounded-md border border-white/20 bg-black/25 px-3 text-base text-ivory outline-none focus:border-gold" />
        </label>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm text-ivory/90">Recipients</legend>
          {players.map((player) => (
            <label key={player.id} className={`flex items-center gap-3 text-sm ${player.online ? 'cursor-pointer text-ivory/80' : 'cursor-not-allowed text-ivory/35'}`}>
              <input type="checkbox" disabled={!player.online} checked={recipients.includes(player.id)} onChange={(event) => setRecipients((current) => event.target.checked ? [...current, player.id] : current.filter((id) => id !== player.id))} className="accent-amber-300" />
              {player.name}{!player.online ? ' (offline)' : ''}
            </label>
          ))}
        </fieldset>
        <p className={`text-xs ${valid ? 'text-ivory/65' : 'text-[#e08a80]'}`}>
          {valid ? `${recipients.length * count} of ${deckCount} available cards will be dealt.` : `${deckCount} cards available. Select players and a valid number of cards.`}
        </p>
        {error && <p role="alert" className="text-xs text-[#e08a80]">The server did not confirm the deal. Check the connection and try again.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-ivory/70 hover:text-ivory">Cancel</button>
          <button type="button" disabled={!valid || pending} onClick={async () => {
            setPending(true)
            setError(false)
            const ok = await onDeal(recipients, count)
            setPending(false)
            if (ok) onClose()
            else setError(true)
          }} className="rounded-md bg-ivory px-4 py-2 text-sm font-semibold text-ink disabled:opacity-35">{pending ? 'Dealing…' : 'Deal'}</button>
        </div>
      </div>
    </div>
  )
}
