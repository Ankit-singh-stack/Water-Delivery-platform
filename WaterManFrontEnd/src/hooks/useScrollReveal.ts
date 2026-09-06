import { useEffect, useRef, useState, type RefObject } from 'react'

export function useScrollReveal<T extends Element = HTMLDivElement>(
  threshold = 0.12,
): [RefObject<T | null>, boolean] {
  const ref        = useRef<T | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold },
    )
    const el = ref.current
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return [ref, isVisible]
}
