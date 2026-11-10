import type { CSSProperties } from 'react'

type SuitIconProps = {
  suit: string
  className?: string
  style?: CSSProperties
}

export function SuitIcon({ suit, className, style }: SuitIconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={`aspect-square ${className ?? ''}`}
      style={style}
      fill="currentColor"
      aria-hidden="true"
    >
      {suit === '♥' && (
        <path d="M50 90C24 70 6 54 6 34 6 19 17 9 30 9c9 0 16 5 20 13 4-8 11-13 20-13 13 0 24 10 24 25 0 20-18 36-44 56Z" />
      )}

      {suit === '♦' && (
        <path d="M50 4Q66 30 86 50 66 70 50 96 34 70 14 50 34 30 50 4Z" />
      )}

      {suit === '♠' && (
        <path d="M50 5c8 15 42 33 42 55 0 14-10 22-22 22-8 0-14-4-17-10 1 10 5 18 13 23H34c8-5 12-13 13-23-3 6-9 10-17 10-12 0-22-8-22-22C8 38 42 20 50 5Z" />
      )}

      {suit === '♣' && (
        <>
          <circle cx="50" cy="28" r="19" />
          <circle cx="28" cy="57" r="19" />
          <circle cx="72" cy="57" r="19" />
          <circle cx="50" cy="52" r="10" />
          <path d="M47 55c0 20-4 31-13 40h32c-9-9-13-20-13-40Z" />
        </>
      )}
    </svg>
  )
}
