import { CardFront } from '../card/CardFront'
import { DeckPileStatic } from '../shared/DeckPileStatic'
import { Kbd } from '../shared/Kbd'
import { Wordmark } from '../shared/Wordmark'

type HomeScreenProps = {
  onOpenTable: () => void
}

const fan = [
  { rank: '9', suit: '♦', rotate: -22 },
  { rank: 'K', suit: '♣', rotate: -11 },
  { rank: 'A', suit: '♠', rotate: 0 },
  { rank: '7', suit: '♥', rotate: 11 },
  { rank: 'Q', suit: '♥', rotate: 22 },
]

const controls = [
  { action: 'Draw a card', how: <>Click the deck</> },
  { action: 'Draw into your hand', how: <><Kbd>Shift</Kbd> + click the deck</> },
  { action: 'Flip a card', how: <>Double-click it</> },
  { action: 'Make a pile', how: <>Select a few, then <Kbd>P</Kbd></> },
]

export function HomeScreen({ onOpenTable }: HomeScreenProps) {
  return (
    <main className="min-h-dvh bg-night p-3 md:p-5">
      <section className="felt table-edge relative flex min-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[1.25rem] md:min-h-[calc(100dvh-2.5rem)]">
        <header className="relative z-10 px-6 py-5 md:px-10 md:py-7">
          <Wordmark />
        </header>

        <div className="relative z-10 grid flex-1 items-center gap-10 px-6 pb-12 md:px-10 lg:grid-cols-[minmax(0,32rem)_1fr] lg:gap-6 lg:pb-16 xl:px-16">
          <div>
            <h1 className="font-display text-[clamp(2.9rem,6vw,5rem)] leading-[0.98] font-semibold tracking-[-0.015em] text-ivory">
              A deck of cards and an empty table.
            </h1>

            <p className="mt-6 max-w-30rem text-[1.05rem] leading-relaxed text-ivory/70 md:text-lg">
              Shuffle, deal, flip and stack. Nothing here enforces the rules, so play
              the game you already know, or make one up as you go.
            </p>

            <button
              type="button"
              onClick={onOpenTable}
              className="group mt-9 inline-flex h-12 items-center gap-3 rounded-md bg-ivory pr-5 pl-6 font-semibold text-ink shadow-[0_8px_20px_-6px_rgba(0,0,0,0.5)] transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
            >
              Open the table
              <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5">
                <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <dl className="mt-12 max-w-104 border-t border-ivory/10 text-sm">
              {controls.map(({ action, how }) => (
                <div key={action} className="flex items-center justify-between gap-6 border-b border-ivory/10 py-2.5">
                  <dt className="text-ivory/85">{action}</dt>
                  <dd className="text-right text-ivory/50">{how}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div aria-hidden="true" className="relative mx-auto h-76 w-full max-w-136 sm:h-96 lg:h-128">
            <div className="absolute top-[4%] left-[6%] -rotate-9deg sm:left-[10%]">
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
