import { useState, useEffect, type ReactNode } from 'react'
import Header from '../../components/Header/Header'
import { useNav } from '../../context/NavigationContext'
import { getSession } from '../../utils/api'
import CitiesPanel from './panels/CitiesPanel'
import RoleManagementPanel from './panels/RoleManagementPanel'
import RoleHistoryPanel from './panels/RoleHistoryPanel'
import TankerTypesPanel from './panels/TankerTypesPanel'
import DeliveryPartnersPanel from './panels/DeliveryPartnersPanel'
import '../Profile/ProfilePage.css'

export type AdminSection = 'cities' | 'roles' | 'history' | 'tankers' | 'delivery-partners'

const VALID_SECTIONS: AdminSection[] = ['cities', 'roles', 'history', 'tankers', 'delivery-partners']

function sectionFromUrl(): AdminSection {
  const s = new URLSearchParams(window.location.search).get('section')
  return VALID_SECTIONS.includes(s as AdminSection) ? (s as AdminSection) : 'tankers'
}

export default function AdminPage() {
  const { navigate } = useNav()
  const role = getSession()?.role
  const isAdmin = role === 'admin' || role === 'super_admin'
  const isSuperAdmin = role === 'super_admin'
  const [active, setActive] = useState<AdminSection>(sectionFromUrl)

  useEffect(() => {
    const onPop = () => setActive(sectionFromUrl())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Synchronous guard after all hooks — redirect immediately
  if (!isAdmin) {
    navigate('home')
    return null
  }

  function switchSection(s: AdminSection) {
    setActive(s)
    const qs = s === 'cities' ? '' : `?section=${s}`
    window.history.replaceState({}, '', `/admin${qs}`)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const items: { key: AdminSection; icon: ReactNode; label: string }[] = [
    { key: 'tankers', icon: <TankerIcon />,  label: 'Tanker Types' },
    { key: 'cities',  icon: <CityIcon />,    label: 'Cities' },
    { key: 'roles',   icon: <UsersIcon />,   label: 'Role Management' },
    { key: 'history', icon: <HistoryIcon />, label: 'Role History' },
    { key: 'delivery-partners', icon: <DeliveryIcon />, label: 'Delivery Partners' },
  ]

  return (
    <>
      <Header />
      <div className="profile-page">
        <div className="container profile-page__inner">

          <aside className="profile-sidebar">
            <div className="profile-sidebar__card">
              <p className="profile-sidebar__heading">Admin</p>
              <nav>
                {items.map(item => (
                  <button
                    key={item.key}
                    className={`profile-sidebar__item${active === item.key ? ' active' : ''}`}
                    onClick={() => switchSection(item.key)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          <main className="profile-content">
            {active === 'tankers' && <TankerTypesPanel />}
            {active === 'cities'  && <CitiesPanel />}
            {active === 'roles'   && <RoleManagementPanel isSuperAdmin={isSuperAdmin} />}
            {active === 'history' && <RoleHistoryPanel />}
            {active === 'delivery-partners' && <DeliveryPartnersPanel />}
          </main>

        </div>
      </div>
    </>
  )
}

function TankerIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h20M2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6"/>
      <path d="M6 12V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6"/>
      <circle cx="8" cy="20" r="1"/><circle cx="16" cy="20" r="1"/>
    </svg>
  )
}
function CityIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M5 21V7l6-4 6 4v14M9 9h1m-1 4h1m4-4h1m-1 4h1m-6 8v-4h4v4"/>
    </svg>
  )
}
function UsersIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}
function HistoryIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v5h5"/>
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/>
      <path d="M12 7v5l4 2"/>
    </svg>
  )
}
function DeliveryIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="2"/>
      <path d="M16 8h4l3 3v5a2 2 0 0 1-2 2h-1"/>
      <circle cx="5.5" cy="18.5" r="2.5"/>
      <circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  )
}
