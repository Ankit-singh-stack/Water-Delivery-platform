import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { Page, AuthMode } from '../types'

// ── URL ↔ Page mapping ────────────────────────────────────────────────────────
const PAGE_PATHS: Record<Page, string> = {
  home:     '/',
  auth:     '/auth',
  profile:  '/profile',
  admin:    '/admin',
  order:    '/order',
  tracking: '/tracking',
  vendor:   '/vendor',
  delivery: '/delivery',
}

function pathToPage(pathname: string): Page {
  if (pathname.startsWith('/profile'))  return 'profile'
  if (pathname.startsWith('/auth'))     return 'auth'
  if (pathname.startsWith('/admin'))    return 'admin'
  if (pathname.startsWith('/order'))    return 'order'
  if (pathname.startsWith('/tracking')) return 'tracking'
  if (pathname.startsWith('/vendor'))   return 'vendor'
  if (pathname.startsWith('/delivery')) return 'delivery'
  return 'home'
}

interface NavigationContextValue {
  page:     Page
  authMode: AuthMode
  navigate: (to: Page, mode?: AuthMode, searchParams?: string) => void
}

const NavigationContext = createContext<NavigationContextValue | undefined>(undefined)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [page,     setPage]     = useState<Page>(() => pathToPage(window.location.pathname))
  const [authMode, setAuthMode] = useState<AuthMode>('login')

  // Sync URL → state on browser back/forward
  useEffect(() => {
    function onPop() {
      setPage(pathToPage(window.location.pathname))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function navigate(to: Page, mode: AuthMode = 'login', searchParams?: string): void {
    const basePath = PAGE_PATHS[to]
    const fullPath = searchParams ? `${basePath}?${searchParams}` : basePath
    if (window.location.pathname + window.location.search !== fullPath) {
      window.history.pushState({ page: to }, '', fullPath)
    }
    setPage(to)
    if (to === 'auth') setAuthMode(mode)
    window.scrollTo({ top: 0, behavior: 'instant' })
    window.dispatchEvent(new CustomEvent('wm:navigate', { detail: { page: to } }))
  }

  return (
    <NavigationContext.Provider value={{ page, authMode, navigate }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNav(): NavigationContextValue {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNav must be used inside NavigationProvider')
  return ctx
}
