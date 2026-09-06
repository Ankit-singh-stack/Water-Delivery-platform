import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, User, Shield, LogOut, Droplets, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useFontSize } from '../../context/FontSizeContext'
import { useNav } from '../../context/NavigationContext'
import { getSession, logout, getNotificationUnreadCount } from '../../utils/api'
import type { FontSizeKey, Session } from '../../types'
import NotificationBell from '../NotificationBell/NotificationBell'

interface Language {
  code:        string
  label:       string
  nativeLabel: string
}

const LANGUAGES: Language[] = [
  { code: 'en', label: 'EN', nativeLabel: 'English' },
  { code: 'te', label: 'తె', nativeLabel: 'తెలుగు'  },
  { code: 'ta', label: 'த',  nativeLabel: 'தமிழ்'   },
]

interface FontButton {
  key:   FontSizeKey
  label: string
  sup:   string
  aria:  string
}

const FONT_BUTTONS: FontButton[] = [
  { key: 'small',  label: 'A', sup: '−', aria: 'Small text'  },
  { key: 'medium', label: 'A', sup: '',  aria: 'Medium text' },
  { key: 'large',  label: 'A', sup: '+', aria: 'Large text'  },
]

const NAV_LINKS = [
  { key: 'home',         labelKey: 'nav.home',         href: '/'        },
  { key: 'features',     labelKey: 'nav.features',     href: '#features'     },
  { key: 'how_it_works', labelKey: 'nav.how_it_works', href: '#how-it-works' },
]

export default function Header() {
  const { t, i18n }              = useTranslation()
  const { fontSize, setFontSize } = useFontSize()
  const { navigate, page }       = useNav()
  const [scrolled,   setScrolled]  = useState(false)
  const [langOpen,   setLangOpen]  = useState(false)
  const [userOpen,   setUserOpen]  = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [session,    setSession]   = useState<Session | null>(() => getSession())
  const [unreadCount, setUnreadCount] = useState(0)
  const langRef  = useRef<HTMLDivElement>(null)
  const userRef  = useRef<HTMLDivElement>(null)

  function handleLogout() {
    logout()
    setSession(null)
    setUserOpen(false)
    setMobileOpen(false)
    navigate('home')
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!session) { setUnreadCount(0); return }
    getNotificationUnreadCount().then(setUnreadCount)
    const id = setInterval(() => getNotificationUnreadCount().then(setUnreadCount), 60_000)
    const onRead = () => getNotificationUnreadCount().then(setUnreadCount)
    window.addEventListener('wm:notifications-read', onRead)
    return () => {
      clearInterval(id)
      window.removeEventListener('wm:notifications-read', onRead)
    }
  }, [session])

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [mobileOpen])

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) ?? LANGUAGES[0]
  const isAdmin = session?.role === 'admin' || session?.role === 'super_admin'

  function goTo(href: string) {
    setMobileOpen(false)
    if (href.startsWith('#')) {
      const el = document.getElementById(href.slice(1))
      if (el) el.scrollIntoView({ behavior: 'smooth' })
      else navigate('home')
    } else {
      navigate('home')
    }
  }

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`fixed inset-x-0 top-0 z-[100] bg-white transition-all duration-300 ${
        scrolled
          ? 'shadow-lg shadow-brand-blue/5 py-3'
          : 'shadow-sm border-b border-slate-100 py-5'
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">

          {/* ── Brand ── */}
          <a
            href="/"
            onClick={(e) => { e.preventDefault(); setMobileOpen(false); navigate('home') }}
            className="group flex shrink-0 items-center gap-2.5"
            aria-label="TankerDrop home"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-blue via-brand-cyan to-brand-teal shadow-lg shadow-brand-cyan/30 transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3">
              <Droplets className="h-6 w-6 text-white" strokeWidth={2.2} />
            </span>
            <span className="bg-gradient-to-r from-brand-blue via-brand-purple to-brand-teal bg-clip-text font-display text-2xl font-extrabold tracking-tight text-transparent">
              TankerDrop
            </span>
          </a>

          {/* ── Desktop nav ── */}
          <nav className="hidden items-center gap-8 lg:flex" aria-label="Main navigation">
            {NAV_LINKS.map((link) => {
              const href = link.href === '/' ? '/' : link.href
              return (
                <a
                  key={link.key}
                  href={href}
                  onClick={(e) => { e.preventDefault(); goTo(href) }}
                  className="group relative py-2 text-sm font-semibold text-ink-soft transition-colors duration-200 hover:text-brand-blue"
                >
                  {t(link.labelKey)}
                  <span className="absolute inset-x-0 -bottom-0.5 h-0.5 origin-left scale-x-0 rounded-full bg-gradient-to-r from-brand-blue via-brand-purple to-brand-teal transition-transform duration-300 group-hover:scale-x-100" />
                </a>
              )
            })}
          </nav>

          {/* ── Right controls ── */}
          <div className="hidden items-center gap-3 lg:flex">

            {/* Font-size toggles */}
            <div className="flex items-center gap-0.5 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1.5 backdrop-blur" aria-label="Text size">
              {FONT_BUTTONS.map(({ key, label, sup, aria }) => (
                <button
                  key={key}
                  className={`grid min-w-[30px] place-items-center rounded-full py-1 text-sm font-bold transition-colors duration-200 ${
                    fontSize === key
                      ? 'bg-gradient-to-br from-brand-blue to-brand-cyan text-white shadow-md shadow-brand-cyan/30'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                  onClick={() => setFontSize(key)}
                  aria-label={aria}
                  title={aria}
                >
                  {label}{sup && <sup>{sup}</sup>}
                </button>
              ))}
            </div>

            {/* Language selector */}
            <div className="relative" ref={langRef}>
              <button
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs font-bold text-slate-600 backdrop-blur transition-colors duration-200 hover:border-brand-cyan/50 hover:text-brand-blue"
                onClick={() => setLangOpen(v => !v)}
                aria-label="Select language"
                aria-expanded={langOpen}
              >
                <span>{currentLang.label}</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${langOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {langOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-[calc(100%+10px)] min-w-[150px] overflow-hidden rounded-2xl border border-slate-100 bg-white/90 shadow-2xl shadow-slate-900/10 backdrop-blur-xl"
                    role="listbox"
                    aria-label="Languages"
                  >
                    {LANGUAGES.map(lang => (
                      <button
                        key={lang.code}
                        className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors duration-150 ${
                          i18n.language === lang.code ? 'bg-gradient-to-r from-brand-blue/10 to-brand-cyan/10 font-bold text-brand-blue' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                        role="option"
                        aria-selected={i18n.language === lang.code}
                        onClick={() => { i18n.changeLanguage(lang.code); setLangOpen(false) }}
                      >
                        <span className="font-bold">{lang.label}</span>
                        <span className="text-xs text-slate-400">{lang.nativeLabel}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Auth / user controls */}
            {session?.role === 'vendor' && (
              <button
                className="rounded-full bg-gradient-to-r from-brand-blue to-brand-cyan px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand-cyan/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
                onClick={() => navigate('vendor')}
              >
                Vendor Dashboard
              </button>
            )}
            {session?.role === 'delivery_partner' && (
              <button
                className="rounded-full bg-gradient-to-r from-brand-blue to-brand-cyan px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand-cyan/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
                onClick={() => navigate('delivery')}
              >
                Delivery Dashboard
              </button>
            )}
            {session && session.role !== 'vendor' && session.role !== 'delivery_partner' && (
              <button
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-blue via-brand-purple to-brand-teal bg-[length:200%_auto] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-purple/30 transition-all duration-300 hover:-translate-y-0.5 hover:bg-right hover:shadow-xl hover:shadow-brand-purple/40"
                onClick={() => navigate('order')}
              >
                <Droplets className="h-4 w-4" />
                Order Water
              </button>
            )}

            {session ? (
              <>
                <NotificationBell />
                <div className="relative" ref={userRef}>
                  <button
                    className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 transition-colors duration-200 ${
                      userOpen ? 'border-brand-cyan/50 bg-brand-cyan/10' : 'border-slate-200 bg-white/70 hover:border-brand-cyan/50 hover:bg-brand-cyan/5'
                    }`}
                    onClick={() => setUserOpen(v => !v)}
                    aria-expanded={userOpen}
                    aria-haspopup="true"
                  >
                    <span className="relative grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-brand-blue to-brand-teal text-sm font-bold text-white shadow-md shadow-brand-cyan/30">
                      {session.name.charAt(0).toUpperCase()}
                      {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" aria-hidden="true" />}
                    </span>
                    <span className="max-w-[140px] truncate text-sm font-semibold text-ink-soft">{session.name}</span>
                    <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${userOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {userOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-[calc(100%+10px)] min-w-[190px] overflow-hidden rounded-2xl border border-slate-100 bg-white/90 shadow-2xl shadow-slate-900/10 backdrop-blur-xl"
                        role="menu"
                      >
                        <button
                          className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-600 transition-colors duration-150 hover:bg-slate-50"
                          role="menuitem"
                          onClick={() => { setUserOpen(false); navigate('profile') }}
                        >
                          <User className="h-4 w-4" />
                          {t('nav.my_profile')}
                          {unreadCount > 0 && (
                            <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>
                          )}
                        </button>
                        {isAdmin && (
                          <button
                            className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-600 transition-colors duration-150 hover:bg-slate-50"
                            role="menuitem"
                            onClick={() => { setUserOpen(false); navigate('admin') }}
                          >
                            <Shield className="h-4 w-4" />
                            {t('nav.admin_panel')}
                          </button>
                        )}
                        <div className="h-px bg-slate-100" />
                        <button
                          className="flex w-full items-center gap-3 px-4 py-3 text-sm text-red-500 transition-colors duration-150 hover:bg-red-50"
                          role="menuitem"
                          onClick={handleLogout}
                        >
                          <LogOut className="h-4 w-4" />
                          {t('nav.logout')}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <>
                <button
                  className="rounded-full px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors duration-200 hover:bg-slate-100 hover:text-brand-blue"
                  onClick={() => navigate('auth', 'login')}
                >
                  {t('nav.login')}
                </button>
                <button
                  className="rounded-full bg-gradient-to-r from-brand-blue via-brand-purple to-brand-teal bg-[length:200%_auto] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-purple/30 transition-all duration-300 hover:-translate-y-0.5 hover:bg-right hover:shadow-xl"
                  onClick={() => navigate('auth', 'signup')}
                >
                  {t('nav.signup')}
                </button>
              </>
            )}
          </div>

          {/* ── Mobile hamburger ── */}
          <button
            className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white/80 text-ink-soft backdrop-blur transition-colors duration-200 hover:text-brand-blue lg:hidden"
            onClick={() => setMobileOpen(v => !v)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>

        </div>
      </div>

      {/* ── Mobile drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 top-0 z-[110] bg-slate-900/40 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
              className="fixed right-0 top-0 z-[120] flex h-full w-[82%] max-w-sm flex-col bg-white shadow-2xl lg:hidden"
              role="dialog"
              aria-label="Mobile menu"
            >
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <span className="flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-blue via-brand-cyan to-brand-teal">
                    <Droplets className="h-5 w-5 text-white" />
                  </span>
                  <span className="bg-gradient-to-r from-brand-blue to-brand-teal bg-clip-text font-display text-xl font-extrabold text-transparent">TankerDrop</span>
                </span>
                <button onClick={() => setMobileOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close menu">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                <nav className="space-y-1" aria-label="Mobile navigation">
                  {NAV_LINKS.map((link, i) => (
                    <motion.a
                      key={link.key}
                      href={link.href}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + i * 0.06 }}
                      onClick={(e) => { e.preventDefault(); goTo(link.href) }}
                      className={`block rounded-xl px-4 py-3.5 text-lg font-semibold transition-colors duration-150 ${
                        page === 'home' ? 'bg-gradient-to-r from-brand-blue/10 to-brand-cyan/10 text-brand-blue' : 'text-ink-soft'
                      }`}
                    >
                      {t(link.labelKey)}
                    </motion.a>
                  ))}
                </nav>

                <div className="mt-6 border-t border-slate-100 pt-6">
                  {/* Font size */}
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Text size</p>
                  <div className="flex items-center gap-0.5 rounded-full border border-slate-200 p-1">
                    {FONT_BUTTONS.map(({ key, label, sup, aria }) => (
                      <button
                        key={key}
                        className={`flex-1 rounded-full py-2 text-sm font-bold transition-colors ${
                          fontSize === key ? 'bg-gradient-to-br from-brand-blue to-brand-cyan text-white' : 'text-slate-500'
                        }`}
                        onClick={() => setFontSize(key)}
                        aria-label={aria}
                      >
                        {label}{sup && <sup>{sup}</sup>}
                      </button>
                    ))}
                  </div>

                  {/* Language */}
                  <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-slate-400">Language</p>
                  <div className="flex gap-2">
                    {LANGUAGES.map(lang => (
                      <button
                        key={lang.code}
                        className={`flex-1 rounded-full py-2.5 text-sm font-bold transition-colors ${
                          i18n.language === lang.code ? 'bg-gradient-to-r from-brand-blue to-brand-cyan text-white' : 'border border-slate-200 text-slate-600'
                        }`}
                        onClick={() => i18n.changeLanguage(lang.code)}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>

                  {/* Auth actions in drawer */}
                  <div className="mt-6 space-y-2">
                    {session ? (
                      <>
                        <button
                          className="flex w-full items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-ink-soft"
                          onClick={() => { setMobileOpen(false); navigate('profile') }}
                        >
                          <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-blue to-brand-teal text-sm font-bold text-white">{session.name.charAt(0).toUpperCase()}</span>
                          {session.name}
                        </button>
                        {isAdmin && (
                          <button
                            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-ink-soft hover:bg-slate-50"
                            onClick={() => { setMobileOpen(false); navigate('admin') }}
                          >
                            <Shield className="h-5 w-5 text-brand-blue" />
                            {t('nav.admin_panel')}
                          </button>
                        )}
                        <button
                          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-red-500 hover:bg-red-50"
                          onClick={handleLogout}
                        >
                          <LogOut className="h-5 w-5" />
                          {t('nav.logout')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="w-full rounded-xl bg-gradient-to-r from-brand-blue via-brand-purple to-brand-teal bg-[length:200%_auto] py-3.5 text-white font-bold transition-all duration-300 hover:bg-right"
                          onClick={() => { setMobileOpen(false); navigate('auth', 'signup') }}
                        >
                          {t('nav.signup')}
                        </button>
                        <button
                          className="w-full rounded-xl border border-slate-200 py-3.5 font-semibold text-ink-soft transition-colors hover:bg-slate-50"
                          onClick={() => { setMobileOpen(false); navigate('auth', 'login') }}
                        >
                          {t('nav.login')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
