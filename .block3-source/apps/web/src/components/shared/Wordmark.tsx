import { SuitIcon } from '../card/SuitIcon'

type WordmarkProps = {
  onClick?: () => void
}

export function Wordmark({ onClick }: WordmarkProps) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className="flex h-7 w-5 -rotate-6 items-center justify-center rounded-[3px] bg-paper text-suit-red shadow-[0_1px_3px_rgba(0,0,0,0.45)] transition-transform duration-200 group-hover:-rotate-12"
      >
        <SuitIcon suit="♥" className="w-2.5" />
      </span>
      <span className="font-display text-[1.7rem] leading-none font-semibold text-ivory">
        VirtualDecks
      </span>
    </>
  )

  if (!onClick) {
    return <div className="flex items-center gap-3">{content}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
      aria-label="VirtualDecks, back to the home page"
    >
      {content}
    </button>
  )
}
