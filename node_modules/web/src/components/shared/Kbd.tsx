import type { ReactNode } from 'react'

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-[4px] border border-ivory/20 bg-black/20 px-1 font-sans text-[10px] font-semibold text-ivory/75">
      {children}
    </kbd>
  )
}
