export function CardBack() {
  return (
    <div className="card-face relative h-full w-full overflow-hidden rounded-lg p-[6%]">
      <div className="card-back-pattern relative h-full w-full rounded-[3px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.25)]">
        <div className="absolute top-1/2 left-1/2 aspect-square w-[34%] -translate-x-1/2 -translate-y-1/2 rotate-45 border border-paper/50 bg-oxblood shadow-[0_0_0_3px_var(--color-oxblood)]">
          <div className="absolute inset-[22%] border border-paper/35" />
        </div>
      </div>
    </div>
  )
}
