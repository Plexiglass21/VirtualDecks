type CountBadgeProps = {
  count: number
}

export function CountBadge({ count }: CountBadgeProps) {
  return (
    <span className="absolute -top-2.5 -right-2.5 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-ink px-1.5 text-[11px] font-semibold text-ivory tabular-nums shadow-[0_2px_6px_rgba(0,0,0,0.35)] ring-1 ring-white/10">
      {count}
    </span>
  )
}
