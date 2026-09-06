import { useState, useEffect, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, MapPin, Package, User, Droplets, ShoppingCart,
  RotateCcw, LifeBuoy, ChevronDown, CheckCircle2, ClipboardList, Truck, Timer,
} from 'lucide-react'
import DashboardLayout, { type NavItem } from '../../components/dashboard/DashboardLayout'
import StatsCard from '../../components/dashboard/StatsCard'
import StatusBadge from '../../components/dashboard/StatusBadge'
import SkeletonLoader from '../../components/dashboard/SkeletonLoader'
import EmptyState from '../../components/dashboard/EmptyState'
import GradientButton from '../../components/dashboard/GradientButton'
import OrderTimeline from '../../components/dashboard/OrderTimeline'
import AnimatedCounter from '../../components/dashboard/AnimatedCounter'
import NotificationPanel, { type NotificationItem } from '../../components/dashboard/NotificationPanel'
import { useNav } from '../../context/NavigationContext'
import { getSession, getOrders, getOrderSummary } from '../../utils/api'
import type { Order, OrderSummary } from '../../types'
import './DashboardPage.css'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const TIMELINE_STEPS = [
  { label: 'Placed', status: 'draft' },
  { label: 'Confirmed', status: 'confirmed' },
  { label: 'Preparing', status: 'preparing' },
  { label: 'On the Way', status: 'out_for_delivery' },
  { label: 'Delivered', status: 'delivered' },
]

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'track', label: 'Track Order', icon: MapPin },
  { id: 'orders', label: 'My Orders', icon: Package },
  { id: 'profile', label: 'Profile', icon: User },
]

function activeStatus(order: Order): string {
  if (['draft'].includes(order.status)) return 'draft'
  if (['confirmed', 'accepted'].includes(order.status)) return 'confirmed'
  if (['preparing', 'ready_for_pickup', 'assigned', 'delivery_accepted', 'arrived_at_pickup', 'picked_up'].includes(order.status)) return 'preparing'
  if (['in_transit', 'out_for_delivery', 'arrived_at_customer'].includes(order.status)) return 'out_for_delivery'
  if (order.status === 'delivered') return 'delivered'
  return 'draft'
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="h-1 w-6 rounded-full bg-gradient-to-r from-brand-cyan to-brand-teal" aria-hidden="true" />
      <h2 className="font-display text-sm font-bold uppercase tracking-widest text-white/50">{children}</h2>
    </div>
  )
}

interface QuickAction {
  label: string
  icon: typeof ShoppingCart
  gradient: string
  onClick: () => void
}

export default function DashboardPage() {
  const { navigate } = useNav()
  const session = getSession()
  const firstName = session?.name.split(' ')[0] ?? 'there'

  const [activeTab, setActiveTab] = useState('dashboard')
  const [orders, setOrders] = useState<Order[]>([])
  const [summary, setSummary] = useState<OrderSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  useEffect(() => {
    Promise.all([getOrders(1, 10), getOrderSummary()]).then(([or, sr]) => {
      if (or.success) setOrders(or.data)
      else setError('Could not load orders.')
      if (sr.success) setSummary(sr.data)
      setLoading(false)
    }).catch(() => {
      setError('Could not connect to server.')
      setLoading(false)
    })
  }, [])

  const activeOrder = orders.find(o =>
    ['draft', 'confirmed', 'accepted', 'preparing', 'ready_for_pickup',
     'assigned', 'delivery_accepted', 'arrived_at_pickup', 'picked_up',
     'in_transit', 'out_for_delivery', 'arrived_at_customer'].includes(o.status)
  )

  const quickActions: QuickAction[] = [
    { label: 'Order Water', icon: ShoppingCart, gradient: 'from-brand-blue/25 to-brand-cyan/10', onClick: () => navigate('order') },
    { label: 'My Orders', icon: Package, gradient: 'from-brand-purple/25 to-brand-blue/10', onClick: () => navigate('profile', undefined, 'panel=orders') },
    { label: 'Track Order', icon: MapPin, gradient: 'from-brand-cyan/25 to-brand-teal/10', onClick: () => navigate('tracking') },
    { label: 'Support', icon: LifeBuoy, gradient: 'from-brand-teal/25 to-brand-cyan/10', onClick: () => navigate('profile') },
  ]

  function handleNavigate(id: string) {
    setActiveTab(id)
    if (id === 'dashboard') return navigate('home')
    if (id === 'track') return navigate('tracking')
    if (id === 'orders') return navigate('profile', undefined, 'panel=orders')
    if (id === 'profile') return navigate('profile')
  }

  function handleLogout() {
    localStorage.removeItem('wm_token')
    localStorage.removeItem('wm_session')
    window.dispatchEvent(new CustomEvent('wm:logout'))
    navigate('home')
  }

  function openNotifications() {
    if (notifications.length === 0) {
      setNotifications([
        { id: '1', title: 'Welcome to TankerDrop', message: 'Order fresh water delivered to your doorstep.', type: 'system', createdAt: new Date().toISOString(), isRead: false },
      ])
    }
    setNotifOpen(true)
  }

  const stats = [
    { label: 'Active Orders', value: summary?.active ?? 0, icon: Timer, accent: true },
    { label: 'Total Orders', value: summary?.total ?? 0, icon: Package, accent: false },
    { label: 'Delivered', value: summary?.delivered ?? 0, icon: CheckCircle2, accent: false },
    { label: 'Saved Addresses', value: '3', icon: MapPin, accent: false },
  ]

  function quickCardBg(gradient: string): string {
    return gradient
  }

  return (
    <DashboardLayout
      navItems={NAV_ITEMS}
      activeItem={activeTab}
      onNavigate={handleNavigate}
      title="Customer Dashboard"
      onLogout={handleLogout}
      notificationCount={notifications.filter(n => !n.isRead).length}
      onNotificationClick={openNotifications}
    >
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 flex flex-wrap items-end justify-between gap-3"
        >
          <div>
            <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
              {greeting()}, <span className="bg-gradient-to-r from-brand-cyan to-brand-teal bg-clip-text text-transparent">{firstName}</span> 👋
            </h1>
            <p className="mt-1 text-sm text-white/40">Here&apos;s what&apos;s happening with your water deliveries.</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-white/50">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long' })}
          </span>
        </motion.div>

        {loading ? (
          <SkeletonLoader variant="stat" />
        ) : error ? (
          <EmptyState icon={Droplets} title="Something went wrong" description={error}
            action={{ label: 'Try again', onClick: () => window.location.reload() }} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((s, i) => (
                <StatsCard key={s.label} label={s.label} value={s.value} icon={s.icon} accent={s.accent} delay={i * 0.08} />
              ))}
            </div>

            <section className="mt-8">
              <SectionTitle>Quick Actions</SectionTitle>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {quickActions.map((a, i) => {
                  const Icon = a.icon
                  return (
                    <motion.button
                      key={a.label}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.06 }}
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={a.onClick}
                      className={`flex flex-col items-center gap-3 rounded-2xl border border-white/[0.08] bg-gradient-to-br ${quickCardBg(a.gradient)} px-4 py-5 text-center transition-shadow duration-300 hover:shadow-glow-cyan/30`}
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.08]">
                        <Icon className="h-5 w-5 text-brand-cyan" aria-hidden="true" />
                      </div>
                      <span className="text-xs font-semibold text-white/70">{a.label}</span>
                    </motion.button>
                  )
                })}
              </div>
            </section>

            {activeOrder && (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-8"
              >
                <SectionTitle>Active Order</SectionTitle>
                <div className="overflow-hidden rounded-2xl border border-brand-cyan/25 bg-gradient-to-br from-brand-blue/10 via-brand-cyan/5 to-brand-teal/10 p-6 shadow-glow-cyan/10">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-cyan to-brand-teal">
                          <Droplets className="h-5 w-5 text-white" aria-hidden="true" />
                        </div>
                        <span className="absolute -right-1 -top-1 flex h-3 w-3">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-teal opacity-75" aria-hidden="true" />
                          <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-teal" aria-hidden="true" />
                        </span>
                      </div>
                      <div>
                        <p className="font-display text-lg font-bold text-white">Order #{activeOrder.orderNumber}</p>
                        <p className="text-xs text-white/40">{formatDate(activeOrder.createdAt)}</p>
                      </div>
                    </div>
                    <StatusBadge status={activeOrder.status} size="md" />
                  </div>

                  <OrderTimeline steps={TIMELINE_STEPS} currentStatus={activeStatus(activeOrder)} />

                  <div className="mt-6 flex flex-wrap gap-3">
                    <GradientButton size="lg" onClick={() => navigate('tracking', undefined, `id=${activeOrder.id}`)}>
                      Track my order
                    </GradientButton>
                  </div>
                </div>
              </motion.section>
            )}

            <section className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <SectionTitle>Recent Orders</SectionTitle>
                <button
                  onClick={() => navigate('profile', undefined, 'panel=orders')}
                  className="text-xs font-semibold text-brand-cyan hover:text-brand-teal transition-colors"
                >
                  See all
                </button>
              </div>

              {orders.length === 0 ? (
                <EmptyState icon={Droplets} title="No orders yet"
                  description="Place your first order and we'll deliver fresh water right to your door."
                  action={{ label: 'Order water', onClick: () => navigate('order') }} />
              ) : (
                <div className="space-y-3">
                  <AnimatePresence>
                    {orders.map((o, i) => {
                      const isOpen = expanded === o.id
                      return (
                        <motion.div
                          key={o.id}
                          layout
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] transition-colors hover:border-brand-cyan/20 hover:bg-white/[0.06]"
                        >
                          <button
                            onClick={() => setExpanded(isOpen ? null : o.id)}
                            aria-expanded={isOpen}
                            className="flex w-full items-center gap-3 p-4 text-left"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                              <Droplets className="h-5 w-5 text-brand-cyan/70" aria-hidden="true" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-body text-sm font-semibold text-white">#{o.orderNumber}</p>
                              <p className="truncate text-xs text-white/40">
                                {[o.deliveryAreaName, o.deliveryCity].filter(Boolean).join(', ') || 'Delivery'}
                              </p>
                            </div>
                            <div className="hidden text-right sm:block">
                              <p className="text-xs text-white/50">{formatDate(o.createdAt)}</p>
                            </div>
                            <StatusBadge status={o.status} size="sm" />
                            <motion.span
                              animate={{ rotate: isOpen ? 180 : 0 }}
                              transition={{ duration: 0.2 }}
                              className="text-white/40"
                              aria-hidden="true"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </motion.span>
                          </button>
                          <AnimatePresence initial={false}>
                            {isOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden"
                              >
                                <div className="border-t border-white/[0.06] px-4 py-4">
                                  <div className="mb-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                                    <div>
                                      <p className="text-xs text-white/40">Quantity</p>
                                      <p className="font-medium text-white/80">{o.quantity} {o.tankerTypeName ?? 'tanker'}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-white/40">Capacity</p>
                                      <p className="font-medium text-white/80">{o.capacityLitres ? `${o.capacityLitres.toLocaleString()} L` : '—'}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-white/40">Amount</p>
                                      <p className="font-medium text-brand-teal">₹{o.totalPrice ? o.totalPrice.toLocaleString('en-IN') : '—'}</p>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <GradientButton size="sm" variant="outline">
                                      <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                                      Reorder
                                    </GradientButton>
                                    <GradientButton size="sm" variant="ghost" onClick={() => navigate('tracking', undefined, `id=${o.id}`)}>
                                      <MapPin className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                                      Track
                                    </GradientButton>
                                    <GradientButton size="sm" variant="ghost" onClick={() => navigate('profile')}>
                                      <LifeBuoy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                                      Support
                                    </GradientButton>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <NotificationPanel isOpen={notifOpen} onClose={() => setNotifOpen(false)} notifications={notifications} />
    </DashboardLayout>
  )
}
