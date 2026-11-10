import { useState } from 'react'
import type { Player } from '../../types/player'

type Props = {
  players: Player[]
  mode: 'all' | 'selected'
  selectedCount: number
  onConfirm: (recipientIds: string[]) => void
  onClose: () => void
}

export function RevealHandDialog({ players, mode, selectedCount, onConfirm, onClose }: Props) {
  const [recipientIds, setRecipientIds] = useState<string[]>(players.filter((player) => player.online).map((player) => player.id))
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Show hand" className="w-[min(26rem,95vw)] space-y-5 rounded-xl border border-white/10 bg-[#161816] p-6 text-ivory shadow-2xl">
        <div>
          <h2 className="font-display text-2xl font-semibold">Show hand</h2>
          <p className="mt-1 text-sm text-ivory/60">{mode === 'all' ? 'Share your current hand' : `Share ${selectedCount} selected cards`} with the chosen players.</p>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm text-ivory/90">Who can see these cards?</legend>
          {players.map((player) => (
            <label key={player.id} className={`flex items-center gap-3 text-sm ${player.online ? 'cursor-pointer text-ivory/80' : 'cursor-not-allowed text-ivory/35'}`}>
              <input type="checkbox" disabled={!player.online} checked={recipientIds.includes(player.id)} onChange={(event) => setRecipientIds((current) => event.target.checked ? [...current, player.id] : current.filter((id) => id !== player.id))} className="accent-amber-300" />
              {player.name}{!player.online ? ' (offline)' : ''}
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-ivory/70 hover:text-ivory">Cancel</button>
          <button type="button" disabled={!recipientIds.length} onClick={() => onConfirm(recipientIds)} className="rounded-md bg-ivory px-4 py-2 text-sm font-semibold text-ink disabled:opacity-35">Show cards</button>
        </div>
      </div>
    </div>
  )
}
