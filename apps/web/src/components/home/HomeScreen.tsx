import { CardFront } from '../card/CardFront'
import { DeckPileStatic } from '../shared/DeckPileStatic'
import { Kbd } from '../shared/Kbd'
import { Wordmark } from '../shared/Wordmark'
import { useState } from 'react'

type HomeScreenProps = {
  onCreateRoom: (deckKind: 'french' | 'italian', nickname: string) => void
  onJoinRoom: (roomId: string, nickname: string) => void
  isConnecting: boolean
  roomError: string | null
}

const fan = [
  { rank: '9', suit: '♦', rotate: -22 },
  { rank: 'K', suit: '♣', rotate: -11 },
  { rank: 'A', suit: '♠', rotate: 0 },
  { rank: '7', suit: '♥', rotate: 11 },
  { rank: 'Q', suit: '♥', rotate: 22 },
]

const desktopControls = [
  { action: 'Draw a card', how: <>Click the deck</> },
  { action: 'Draw into your hand', how: <><Kbd>Shift</Kbd> + click the deck</> },
  { action: 'Flip a card', how: <>Double-click it</> },
  { action: 'Make a pile', how: <>Select a few, then <Kbd>P</Kbd></> },
]

const mobileControls = [
  { action: 'Draw to the table', how: 'Tap the deck' },
  { action: 'Draw into your hand', how: 'Use Deck → hand' },
  { action: 'Flip / rotate', how: 'Select a card, use the action bar' },
  { action: 'Select multiple cards', how: 'Hold a card or tap Multi' },
]

function getLastNickname() {
  try { return localStorage.getItem('virtualdecks:last-nickname') ?? '' } catch { return '' }
}

export function HomeScreen({ onCreateRoom, onJoinRoom, isConnecting, roomError }: HomeScreenProps) {
  const [roomCode, setRoomCode] = useState('')
  const [nickname, setNickname] = useState(getLastNickname)
  const trimmedNickname = nickname.normalize('NFKC').trim().replace(/\s+/g, ' ')
  const validNickname = [...trimmedNickname].length >= 2 && [...trimmedNickname].length <= 20 &&
    /^[\p{L}\p{N}](?:[\p{L}\p{N} ._'-]*[\p{L}\p{N}])?$/u.test(trimmedNickname)
  const [deckKind, setDeckKind] = useState<'french' | 'italian'>('french')

  return (
    <main className="home-page min-h-dvh bg-night p-2 sm:p-3 md:p-5">
      <section className="home-shell felt table-edge relative flex min-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[1.25rem] md:min-h-[calc(100dvh-2.5rem)]">
        <header className="relative z-10 px-5 py-4 sm:px-6 md:px-10 md:py-5 xl:px-12">
          <Wordmark />
        </header>

        <div className="home-grid relative z-10 grid flex-1 items-center gap-5 px-5 pb-5 sm:px-6 md:px-10 lg:grid-cols-[minmax(0,34rem)_1fr] lg:gap-8 lg:pb-8 xl:px-12">
          <div className="home-content">
            <h1 className="home-title max-w-144 font-display text-[clamp(2.7rem,5.8vw,3.75rem)] leading-[0.99] font-semibold tracking-[-0.015em] text-ivory">
              A deck of cards and an empty table.
            </h1>

            <p className="mt-3 max-w-[31rem] text-sm leading-relaxed text-ivory/70 sm:text-base">
              Shuffle, deal, flip and stack. Nothing here enforces the rules, so play
              the game you already know, or make one up as you go.
            </p>

            <div className="mt-4 max-w-112">
              <label htmlFor="player-nickname" className="mb-1.5 block text-[11px] font-semibold tracking-wider text-ivory/65 uppercase">Your nickname</label>
              <input
                id="player-nickname"
                type="text"
                value={nickname}
                maxLength={20}
                autoComplete="nickname"
                placeholder="How should others call you?"
                onChange={(event) => setNickname(event.target.value)}
                aria-describedby="nickname-help"
                className="h-10 w-full rounded-md border border-ivory/15 bg-black/20 px-3 text-sm text-ivory outline-none placeholder:text-ivory/35 focus:border-gold"
              />
              <p id="nickname-help" className="mt-1 text-[11px] leading-snug text-ivory/55">2–20 characters. Letters, numbers and simple separators. Visible to everyone at your table.</p>
              {nickname.length > 0 && !validNickname && <p className="mt-1 text-xs text-[#e08a80]">Enter a valid nickname to continue.</p>}
            </div>

            <fieldset className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ivory/85">
              <legend className="mb-1 text-[11px] uppercase tracking-wider text-ivory/60">Choose a deck</legend>
              <label className="flex items-center gap-2"><input type="radio" name="deckKind" value="french" checked={deckKind === 'french'} onChange={() => setDeckKind('french')} /> French · 52 cards</label>
              <label className="flex items-center gap-2"><input type="radio" name="deckKind" value="italian" checked={deckKind === 'italian'} onChange={() => setDeckKind('italian')} /> Italian · 40 cards</label>
            </fieldset>

            <div className="home-room-actions mt-4 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
              <button
                type="button"
                onClick={() => onCreateRoom(deckKind, trimmedNickname)}
                disabled={isConnecting || !validNickname}
                className="group inline-flex h-11 w-full items-center justify-center gap-3 rounded-md bg-ivory px-5 text-sm font-semibold text-ink shadow-[0_8px_20px_-6px_rgba(0,0,0,0.5)] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold sm:w-auto"
              >
                Open the table
                <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5">
                  <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  if (roomCode.length !== 4 || !validNickname || isConnecting) return
                  onJoinRoom(roomCode, trimmedNickname)
                }}
                className="flex min-w-0 items-center gap-2"
              >
                <input
                  type="text"
                  value={roomCode}
                  maxLength={4}
                  aria-label="Room code"
                  placeholder="Room code"
                  onChange={(event) => {
                    setRoomCode(
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '')
                        .slice(0, 4),
                    )
                  }}
                  className="h-11 min-w-0 flex-1 rounded-md border border-ivory/15 bg-black/20 px-3 text-sm font-medium tracking-[0.15em] text-ivory uppercase outline-none placeholder:tracking-normal placeholder:text-ivory/35 focus:border-gold"
                />

                <button
                  type="submit"
                  disabled={roomCode.length !== 4 || isConnecting || !validNickname}
                  className="h-11 rounded-md border border-ivory/15 px-4 text-sm font-medium text-ivory/80 transition-colors hover:border-ivory/30 hover:text-ivory disabled:cursor-default disabled:opacity-35"
                >
                  Join
                </button>
              </form>
            </div>

            {roomError && (
              <p role="alert" className="mt-2 text-sm text-[#e08a80]">
                {roomError}
              </p>
            )}

            <details className="home-instructions group mt-5 max-w-112 border-t border-ivory/15 text-xs text-ivory/75">
              <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm font-medium text-ivory/85 select-none marker:hidden focus-visible:outline-2 focus-visible:outline-gold [&::-webkit-details-marker]:hidden">
                How to play
                <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 transition-transform duration-150 group-open:rotate-180">
                  <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <dl className="border-t border-ivory/10 pb-2">
                {mobileControls.map(({ action, how }) => (
                  <div key={action} className="flex items-center justify-between gap-3 border-b border-ivory/10 py-2.5 sm:hidden">
                    <dt className="text-ivory/85">{action}</dt>
                    <dd className="max-w-[55%] text-right text-ivory/60">{how}</dd>
                  </div>
                ))}
                {desktopControls.map(({ action, how }) => (
                  <div key={action} className="hidden items-center justify-between gap-6 border-b border-ivory/10 py-2.5 sm:flex">
                    <dt className="text-ivory/85">{action}</dt>
                    <dd className="text-right text-ivory/50">{how}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>

          <div aria-hidden="true" className="home-illustration relative mx-auto h-52 w-full max-w-120 sm:h-84 lg:h-112">
            <div className="absolute top-[4%] left-[6%] -rotate-9 sm:left-[10%]">
              <DeckPileStatic className="h-37.75 w-25 sm:h-42.75 sm:w-30" />
            </div>

            {fan.map((card) => (
              <div
                key={`${card.rank}${card.suit}`}
                className="absolute bottom-[6%] left-1/2 h-39.25 w-27.5 -translate-x-1/2 sm:h-50 sm:w-35"
                style={{ rotate: `${card.rotate}deg`, transformOrigin: '50% 165%' }}
              >
                <CardFront rank={card.rank} suit={card.suit} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
