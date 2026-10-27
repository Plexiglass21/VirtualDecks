import { CardBack } from '../card/CardBack'

type DeckPileStaticProps = {
  className?: string
}

export function DeckPileStatic({ className = 'h-[180px] w-[126px]' }: DeckPileStaticProps) {
  return (
    <div className={`relative ${className}`}>
      {[6, 4.5, 3, 1.5].map((offset) => (
        <div
          key={offset}
          className="card-edge absolute inset-0 rounded-lg"
          style={{ transform: `translate(${offset}px, ${offset}px)` }}
        />
      ))}
      <div className="absolute inset-0">
        <CardBack />
      </div>
    </div>
  )
}
