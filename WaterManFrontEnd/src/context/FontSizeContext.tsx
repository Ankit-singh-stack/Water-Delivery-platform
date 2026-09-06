import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { FontSizeKey } from '../types'

interface FontSizeContextValue {
  fontSize:    FontSizeKey
  setFontSize: (size: FontSizeKey) => void
}

const FontSizeContext = createContext<FontSizeContextValue | undefined>(undefined)

const SIZES: Record<FontSizeKey, number> = { small: 0.875, medium: 1, large: 1.2 }

export function FontSizeProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSize] = useState<FontSizeKey>('medium')

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(SIZES[fontSize]))
  }, [fontSize])

  return (
    <FontSizeContext.Provider value={{ fontSize, setFontSize }}>
      {children}
    </FontSizeContext.Provider>
  )
}

export function useFontSize(): FontSizeContextValue {
  const ctx = useContext(FontSizeContext)
  if (!ctx) throw new Error('useFontSize must be used inside FontSizeProvider')
  return ctx
}
