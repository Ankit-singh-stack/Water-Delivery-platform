import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Droplets, Menu, X, Bell, LogOut, type LucideIcon } from 'lucide-react'
import { getSession } from '../../utils/api'

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  badge?: number
}

interface DashboardLayoutProps {
  children: React.ReactNode
  navItems: NavItem[]
  activeItem: string
  onNavigate: (id: string) => void
  title: string
  onLogout?: () => void
  notificationCount?: number
  onNotificationClick?: () => void
}

const SIDEBAR_WIDE = 240
const SIDEBAR_NARROW = 80

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardLayout({
  children,
  navItems,
  activeItem,
  onNavigate,
  title,
  onLogout,
  notificationCount = 0,
  onNotificationClick,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const session = getSession()
  const firstName = session?.name.split(' ')[0] ?? 'there'

  function navbarItem(nav: NavItem) {
    const isActive = nav.id === activeItem
    return (
      <button
        key={nav.id}
        onClick={() => {
          onNavigate(nav.id)
          setDrawerOpen(false)
        }}
        aria-current={isActive ? 'page' : undefined}
        className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 font-body text-sm font-medium transition-colors ${isActive ? 'text-white' : 'text-white/60 hover:text-white hover:bg-white/[0.06]'}`}
      >
        {isActive && (
          <motion.span
            layoutId={`nav-${sidebarOpen ? 'wide' : 'narrow'}-${nav.id}`}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-blue via-brand-cyan to-brand-teal/[0.25] shadow-glow-cyan"
            aria-hidden="true"
          />
        )}
        <nav.icon className={`relative z-10 h-5 w-5 shrink-0 ${isActive ? 'text-brand-cyan' : 'text-white/50 group-hover:text-white'}`} aria-hidden="true" />
        <span className={`relative z-10 whitespace-nowrap transition-opacity ${sidebarOpen ? 'opacity-100' : 'lg:hidden'} ${sidebarOpen ? '' : 'hidden'}`}>
          {nav.label}
        </span>
        {nav.badge !== undefined && nav.badge > 0 && (
          <span className="relative z-10 ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-r from-brand-cyan to-brand-teal px-1.5 text-[10px] font-bold text-deep">
            {nav.badge > 99 ? '99+' : nav.badge}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-deep font-body">
      <div className="flex min-h-screen">
        <motion.aside
          initial={false}
          animate={{ width: sidebarOpen ? SIDEBAR_WIDE : SIDEBAR_NARROW }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-white/[0.08] bg-ocean lg:flex"
          aria-label="Sidebar navigation"
        >
          <div className="flex h-16 items-center gap-2 overflow-hidden border-b border-white/[0.08] px-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-blue via-brand-cyan to-brand-teal shadow-glow-cyan">
              <Droplets className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <AnimatePresence initial={false}>
              {sidebarOpen && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="whitespace-nowrap font-display text-lg font-bold bg-gradient-to-r from-brand-cyan to-brand-teal bg-clip-text text-transparent"
                >
                  TankerDrop
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {navItems.map(navbarItem)}
          </nav>

          <div className="border-t border-white/[0.08] p-3">
            {onLogout && (
              <button
                onClick={onLogout}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 font-body text-sm font-medium text-white/60 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
                {sidebarOpen && <span className="whitespace-nowrap">Sign out</span>}
              </button>
            )}
          </div>

          <button
            onClick={() => setSidebarOpen(o => !o)}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            className="absolute -right-3 top-16 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-ocean text-white/60 hover:text-white transition-colors"
          >
            <Menu className="h-3.5 w-3.5 rotate-90" aria-hidden="true" />
          </button>
        </motion.aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-white/[0.08] bg-deep/80 px-4 backdrop-blur-md sm:px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="Open navigation menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="flex items-center gap-2 lg:hidden">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-blue via-brand-cyan to-brand-teal shadow-glow-cyan">
                  <Droplets className="h-4 w-4 text-white" aria-hidden="true" />
                </div>
                <span className="font-display text-base font-bold bg-gradient-to-r from-brand-cyan to-brand-teal bg-clip-text text-transparent">
                  TankerDrop
                </span>
              </div>
              <div className="hidden flex-col lg:flex">
                <span className="font-display text-lg font-semibold text-white">{title}</span>
                <span className="text-xs text-white/40">
                  {greeting()}, {firstName}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="font-body text-sm font-semibold text-white">{session?.name ?? 'Guest'}</p>
                <p className="font-body text-xs text-white/40">{session?.role ?? 'user'}</p>
              </div>
              <button
                onClick={onNotificationClick}
                aria-label={`Notifications${notificationCount > 0 ? `, ${notificationCount} unread` : ''}`}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Bell className="h-5 w-5" aria-hidden="true" />
                {notificationCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-red-500 to-red-600 px-1 text-[10px] font-bold text-white">
                    {notificationCount > 99 ? '99+' : notificationCount}
                  </span>
                )}
              </button>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <div className="mb-4 lg:hidden">
              <h1 className="font-display text-xl font-semibold text-white">{title}</h1>
            </div>
            {children}
          </main>

          <nav
            className="sticky bottom-0 z-40 flex items-center justify-around border-t border-white/[0.08] bg-ocean/95 px-2 py-2 backdrop-blur-md lg:hidden"
            aria-label="Bottom navigation"
          >
            {navItems.map(nav => {
              const isActive = nav.id === activeItem
              return (
                <button
                  key={nav.id}
                  onClick={() => onNavigate(nav.id)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={nav.label}
                  className={`relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 font-body text-[10px] font-medium transition-colors ${isActive ? 'text-brand-cyan' : 'text-white/50'}`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="bottom-nav-active"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      className="absolute inset-0 rounded-xl bg-brand-cyan/15"
                      aria-hidden="true"
                    />
                  )}
                  <nav.icon className="relative z-10 h-5 w-5" aria-hidden="true" />
                  <span className="relative z-10">{nav.label}</span>
                  {nav.badge !== undefined && nav.badge > 0 && (
                    <span className="relative z-10 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand-cyan px-1 text-[8px] font-bold text-deep">
                      {nav.badge > 9 ? '9+' : nav.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
              className="fixed left-0 top-0 z-50 flex h-full w-72 flex-col bg-ocean shadow-glass-lg lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
            >
              <div className="flex h-16 items-center justify-between border-b border-white/[0.08] px-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-blue via-brand-cyan to-brand-teal shadow-glow-cyan">
                    <Droplets className="h-5 w-5 text-white" aria-hidden="true" />
                  </div>
                  <span className="font-display text-lg font-bold bg-gradient-to-r from-brand-cyan to-brand-teal bg-clip-text text-transparent">
                    TankerDrop
                  </span>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close menu"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <nav className="flex-1 space-y-1 overflow-y-auto p-3">
                {navItems.map(nav => navbarItem(nav))}
              </nav>
              {onLogout && (
                <div className="border-t border-white/[0.08] p-3">
                  <button
                    onClick={onLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 font-body text-sm font-medium text-white/60 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  >
                    <LogOut className="h-5 w-5" aria-hidden="true" />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
