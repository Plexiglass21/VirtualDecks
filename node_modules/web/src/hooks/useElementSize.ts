import { useLayoutEffect, useState, type RefObject } from 'react'

export type ElementSize = {
  width: number
  height: number
}

export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current

    if (!element) return

    function update() {
      if (!element) return

      const width = element.clientWidth
      const height = element.clientHeight

      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height }
      )
    }

    update()

    const observer = new ResizeObserver(update)
    observer.observe(element)

    return () => observer.disconnect()
  }, [ref])

  return size
}
