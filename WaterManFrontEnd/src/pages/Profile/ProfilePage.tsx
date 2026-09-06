import { useState, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Header        from '../../components/Header/Header'
import GeneralInfo   from './panels/GeneralInfo'
import MyAddress     from './panels/MyAddress'
import MyOrders      from './panels/MyOrders'
import ChangePassword from './panels/ChangePassword'
import Notifications  from './panels/Notifications'
import HelpSupport    from './panels/HelpSupport'
import AppInfo        from './panels/AppInfo'
import './ProfilePage.css'

export type ProfilePanel = 'general' | 'addresses' | 'orders' | 'password' | 'notifications' | 'help' | 'appinfo'

const VALID_PANELS: ProfilePanel[] = ['general','addresses','orders','password','notifications','help','appinfo']

function panelFromUrl(): ProfilePanel {
  const p = new URLSearchParams(window.location.search).get('panel')
  return VALID_PANELS.includes(p as ProfilePanel) ? (p as ProfilePanel) : 'general'
}

const PANEL_COMPONENTS: Record<ProfilePanel, ReactNode> = {
  general:       <GeneralInfo />,
  addresses:     <MyAddress />,
  orders:        <MyOrders />,
  notifications: <Notifications />,
  help:          <HelpSupport />,
  password:      <ChangePassword />,
  appinfo:       <AppInfo />,
}

export default function ProfilePage() {
  const { t } = useTranslation()
  const [active,  setActive]  = useState<ProfilePanel>(panelFromUrl)
  // Track which panels have ever been activated — they stay mounted once visited.
  const [mounted, setMounted] = useState<Set<ProfilePanel>>(() => new Set([panelFromUrl()]))

  // Read panel param when URL changes via back/forward
  useEffect(() => {
    const onPop = () => {
      const p = panelFromUrl()
      setMounted(prev => new Set(prev).add(p))
      setActive(p)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Read panel param when navigate() targets 'profile' while already on this page
  useEffect(() => {
    const onNav = (e: Event) => {
      if ((e as CustomEvent<{ page: string }>).detail.page !== 'profile') return
      const p = panelFromUrl()
      setMounted(prev => new Set(prev).add(p))
      setActive(p)
    }
    window.addEventListener('wm:navigate', onNav)
    return () => window.removeEventListener('wm:navigate', onNav)
  }, [])

  function switchPanel(p: ProfilePanel) {
    setMounted(prev => new Set(prev).add(p))
    setActive(p)
    const qs = p === 'general' ? '' : `?panel=${p}`
    window.history.replaceState({}, '', `/profile${qs}`)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const items: { key: ProfilePanel; icon: ReactNode; label: string }[] = [
    { key: 'general',       icon: <PersonIcon />,        label: t('profile.nav.general')       },
    { key: 'addresses',     icon: <PinIcon />,           label: t('profile.nav.addresses')     },
    { key: 'orders',        icon: <OrdersIcon />,        label: t('profile.nav.orders')        },
    { key: 'notifications', icon: <BellIcon />,          label: t('profile.nav.notifications') },
    { key: 'help',          icon: <HelpIcon />,          label: t('profile.nav.help')          },
    { key: 'password',      icon: <LockIcon />,          label: t('profile.nav.password')      },
    { key: 'appinfo',       icon: <InfoIcon />,          label: 'App Info'                      },
  ]

  return (
    <>
      <Header />
      <div className="profile-page">
        <div className="container profile-page__inner">

          <aside className="profile-sidebar">
            <div className="profile-sidebar__card">
              <p className="profile-sidebar__heading">{t('profile.account')}</p>
              <nav>
                {items.map(item => (
                  <button
                    key={item.key}
                    className={`profile-sidebar__item${active === item.key ? ' active' : ''}`}
                    onClick={() => switchPanel(item.key)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          <main className="profile-content">
            {(Object.keys(PANEL_COMPONENTS) as ProfilePanel[]).map(key =>
              mounted.has(key) ? (
                <div key={key} style={{ display: active === key ? 'contents' : 'none' }}>
                  {PANEL_COMPONENTS[key]}
                </div>
              ) : null
            )}
          </main>

        </div>
      </div>
    </>
  )
}

function PersonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  )
}
function PinIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  )
}
function OrdersIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
      <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
    </svg>
  )
}
function BellIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}
function HelpIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
}
function LockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}
function InfoIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="8"/>
      <line x1="12" y1="12" x2="12" y2="16"/>
    </svg>
  )
}
