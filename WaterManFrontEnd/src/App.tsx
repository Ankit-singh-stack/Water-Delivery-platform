import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontSizeProvider } from './context/FontSizeContext'
import { NavigationProvider, useNav } from './context/NavigationContext'
import Header     from './components/Header/Header'
import Hero       from './components/Hero/Hero'
import Features   from './components/Features/Features'
import HowItWorks from './components/HowItWorks/HowItWorks'
import Footer     from './components/Footer/Footer'
import AuthPage            from './pages/Auth/AuthPage'
import ProfilePage         from './pages/Profile/ProfilePage'
import AdminPage           from './pages/Admin/AdminPage'
import OrderPage           from './pages/Order/OrderPage'
import TrackingPage        from './pages/Tracking/TrackingPage'
import VendorOrdersPage    from './pages/Vendor/VendorOrdersPage'
import DeliveryPartnerPage from './pages/Delivery/DeliveryPartnerPage'
import DashboardPage       from './pages/Dashboard/DashboardPage'
import { getSession }      from './utils/api'
import type { Session }    from './types'

function AppContent() {
  const { i18n }           = useTranslation()
  const { page, authMode } = useNav()
  const [session, setSession] = useState(getSession)

  useEffect(() => {
    document.documentElement.lang = i18n.language
  }, [i18n.language])

  useEffect(() => {
    const onLogout = () => setSession(null)
    const onLogin  = (e: Event) => setSession((e as CustomEvent).detail as Session)
    window.addEventListener('wm:logout', onLogout)
    window.addEventListener('wm:login',  onLogin)
    return () => {
      window.removeEventListener('wm:logout', onLogout)
      window.removeEventListener('wm:login',  onLogin)
    }
  }, [])

  if (page === 'auth')     return <AuthPage defaultMode={authMode} />
  if (page === 'profile')  return <ProfilePage />
  if (page === 'admin')    return <AdminPage />
  if (page === 'order')    return <OrderPage />
  if (page === 'tracking') return <TrackingPage />
  if (page === 'vendor')   return <VendorOrdersPage />
  if (page === 'delivery') return <DeliveryPartnerPage />

  // Logged-in user → dashboard; vendor → vendor page; delivery_partner → delivery page; guest → landing
  if (page === 'home' && session) {
    if (session.role === 'vendor')         return <VendorOrdersPage />
    if (session.role === 'delivery_partner') return <DeliveryPartnerPage />
    return <DashboardPage />
  }

  return (
    <div className="app">
      <Header />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
      </main>
      <Footer />
    </div>
  )
}

export default function App() {
  return (
    <FontSizeProvider>
      <NavigationProvider>
        <AppContent />
      </NavigationProvider>
    </FontSizeProvider>
  )
}
