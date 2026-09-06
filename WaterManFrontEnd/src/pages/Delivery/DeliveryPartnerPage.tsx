import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNav } from '../../context/NavigationContext'
import {
  getDeliveryDashboard,
  getDeliveryStatus,
  toggleDeliveryAvailability,
  getDeliveryRequests,
  acceptDeliveryRequest,
  rejectDeliveryRequest,
  getDeliveryOrderDetail,
  advanceDeliveryStatus,
  confirmDeliveryOtp,
  getDeliveryEarnings,
  getDeliveryDeliveries,
  generateDeliveryOtp,
  updateDeliveryLocation,
} from '../../utils/api'
import { routeEmbed, directions, openInMaps, formatDistanceKm } from '../../utils/maps'
import DashboardLayout, { type NavItem } from '../../components/dashboard/DashboardLayout'
import StatsCard from '../../components/dashboard/StatsCard'
import StatusBadge from '../../components/dashboard/StatusBadge'
import SkeletonLoader from '../../components/dashboard/SkeletonLoader'
import EmptyState from '../../components/dashboard/EmptyState'
import GradientButton from '../../components/dashboard/GradientButton'
import OrderTimeline from '../../components/dashboard/OrderTimeline'
import NotificationBell from '../../components/NotificationBell/NotificationBell'
import { connectSocket } from '../../utils/socket'
import type {
  DeliveryDashboard,
  DeliveryAssignment,
  DeliveryOrderDetail,
  DeliveryEarnings,
  DeliveryListItem,
} from '../../types'
import {
  LayoutDashboard,
  Bell,
  Truck,
  Clock,
  Wallet,
  Timer,
  IndianRupee,
  Package,
  MapPin,
  ShieldCheck,
  XCircle,
  CheckCircle2,
  Copy,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Building2,
  Droplets,
  MapPinned,
  ExternalLink,
  Navigation,
  Loader2,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import './DeliveryPartnerPage.css'

type Panel = 'dashboard' | 'requests' | 'active' | 'history' | 'earnings'

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'requests', label: 'Requests', icon: Bell },
  { id: 'active', label: 'Active Delivery', icon: Truck },
  { id: 'history', label: 'History', icon: Clock },
  { id: 'earnings', label: 'Earnings', icon: Wallet },
]

const DELIVERY_STEPS = [
  { label: 'Assigned', status: 'assigned' },
  { label: 'Accepted', status: 'delivery_accepted' },
  { label: 'At Filling Point', status: 'arrived_at_pickup' },
  { label: 'Filling Completed', status: 'picked_up' },
  { label: 'En Route', status: 'out_for_delivery' },
  { label: 'At Customer', status: 'arrived_at_customer' },
  { label: 'Delivered', status: 'delivered' },
]

const FLOW_STEPS = [
  'assigned', 'delivery_accepted', 'arrived_at_pickup',
  'picked_up', 'out_for_delivery', 'arrived_at_customer', 'delivered',
] as const

function formatStatus(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// While this page is open the partner's device position is streamed to the server
// (delivery_partner_profiles + driver_locations when riding an order), which keeps
// the customer's and vendor's live maps in sync. Gated to when the partner is
// online or actively delivering so off-duty sessions don't send updates.
function useLiveDeliveryLocation() {
  const activeOrderRef = useRef<string | null>(null)
  const isOnlineRef = useRef(false)

  useEffect(() => {
    let watchId: number | null = null
    let cancelled = false
    let poll: ReturnType<typeof setInterval> | null = null

    const refresh = async () => {
      const res = await getDeliveryDashboard()
      if (!cancelled && res.success) {
        isOnlineRef.current = res.data.isOnline
        activeOrderRef.current = res.data.activeDelivery?.id ?? null
      }
    }

    const push = (latitude: number, longitude: number) => {
      if (!isOnlineRef.current && !activeOrderRef.current) return
      void updateDeliveryLocation({
        latitude,
        longitude,
        orderId: activeOrderRef.current ?? undefined,
      })
    }

    void refresh()
    poll = setInterval(refresh, 20000)

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        pos => push(pos.coords.latitude, pos.coords.longitude),
        () => {},
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
      )
    }

    return () => {
      cancelled = true
      if (poll) clearInterval(poll)
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
    }
  }, [])
}

const fadeSlide = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
}

const PANEL_TITLES: Record<Panel, string> = {
  dashboard: 'Delivery Partner Dashboard',
  requests: 'Delivery Requests',
  active: 'Active Delivery',
  history: 'Delivery History',
  earnings: 'Earnings',
}

export default function DeliveryPartnerPage() {
  const { navigate } = useNav()
  const [panel, setPanel] = useState<Panel>('dashboard')
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wm_session') || 'null') as { name: string; role: string } | null }
    catch { return null }
  })
  const [accStatus, setAccStatus] = useState<'pending' | 'active' | 'suspended' | 'rejected' | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [vendorName, setVendorName] = useState<string | undefined>(undefined)

  useLiveDeliveryLocation()

  const checkStatus = useCallback(async () => {
    const res = await getDeliveryStatus()
    if (res.success) {
      setAccStatus(res.data.status)
      setVendorName(res.data.vendorName ?? undefined)
    } else {
      // If the status endpoint itself says the profile is missing, keep the last
      // known state; otherwise fall through to the dashboard which will surface errors.
      setAccStatus(prev => prev)
    }
    setStatusLoading(false)
  }, [])

  useEffect(() => {
    if (!session) { navigate('auth', 'login'); return }
    if (session.role !== 'delivery_partner') { navigate('home'); return }
    checkStatus()
  }, [session, navigate, checkStatus])

  // When a vendor approves us in real-time, drop the approval gate immediately.
  useEffect(() => {
    const socket = connectSocket()
    const onApproved = () => { checkStatus() }
    socket.on('partner-approved', onApproved)
    return () => { socket.off('partner-approved', onApproved) }
  }, [checkStatus])

  const handleLogout = useCallback(() => {
    localStorage.removeItem('wm_token')
    localStorage.removeItem('wm_session')
    window.dispatchEvent(new CustomEvent('wm:logout'))
  }, [])

  // Approval gate: pending / suspended / rejected partners see a clear message
  // instead of a broken dashboard (their /delivery/* calls 403 until active).
  if (!statusLoading && accStatus && accStatus !== 'active') {
    const blocked = accStatus === 'suspended' || accStatus === 'rejected'
    return (
      <div className="min-h-screen bg-[#070d1a] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center"
        >
          <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-5 ${
            blocked ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
          }`}>
            {blocked ? <XCircle size={28} /> : <Clock size={28} />}
          </div>
          <h1 className="font-display text-2xl font-semibold text-white mb-2">
            {blocked ? 'Account Not Active' : 'Pending Vendor Approval'}
          </h1>
          <p className="font-body text-sm text-white/60 leading-relaxed mb-6">
            {blocked
              ? `Your delivery partner account has been ${accStatus}. Please contact your vendor for more information.`
              : vendorName
                ? `${vendorName} needs to approve your signup before you can go online and accept deliveries. You'll be notified the moment you're approved.`
                : 'A vendor needs to approve your signup before you can go online and accept deliveries. You\'ll be notified the moment you\'re approved.'}
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-white/40">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Status: {accStatus}
          </div>
          <button
            onClick={handleLogout}
            className="mt-8 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            Sign out
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <DashboardLayout
      navItems={NAV_ITEMS}
      activeItem={panel}
      onNavigate={(id: string) => setPanel(id as Panel)}
      title={PANEL_TITLES[panel]}
      onLogout={handleLogout}
    >
      <AnimatePresence mode="wait">
        {panel === 'dashboard' && <DashboardPanel key="dashboard" onNavigate={setPanel} />}
        {panel === 'requests' && <RequestsPanel key="requests" />}
        {panel === 'active' && <ActivePanel key="active" />}
        {panel === 'history' && <HistoryPanel key="history" />}
        {panel === 'earnings' && <EarningsPanel key="earnings" />}
      </AnimatePresence>
    </DashboardLayout>
  )
}

function DashboardPanel({ onNavigate }: { onNavigate: (p: Panel) => void }) {
  const [data, setData] = useState<DeliveryDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getDeliveryDashboard()
    if (res.success) setData(res.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggleOnline = async () => {
    if (!data || toggling) return
    setToggling(true)
    const res = await toggleDeliveryAvailability({ isOnline: !data.isOnline })
    if (!res.success && res.error) { setToggling(false); return }
    await load()
    setToggling(false)
  }

  const handleToggleAvailable = async () => {
    if (!data || toggling) return
    setToggling(true)
    await toggleDeliveryAvailability({ isAvailable: !data.isAvailable })
    await load()
    setToggling(false)
  }

  if (loading) {
    return (
      <motion.div {...fadeSlide} className="space-y-6">
        <SkeletonLoader variant="stat" />
        <SkeletonLoader variant="card" count={2} />
      </motion.div>
    )
  }

  if (!data) {
    return (
      <motion.div {...fadeSlide}>
        <EmptyState icon={Truck} title="Failed to load dashboard" description="Please try again later." />
      </motion.div>
    )
  }

  const isPending = data.status === 'pending'
  const isBlocked = data.status === 'suspended' || data.status === 'rejected'

  return (
    <motion.div {...fadeSlide} className="space-y-8">
      {(isPending || isBlocked) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`rounded-2xl border px-5 py-4 font-body text-sm font-medium ${
            isBlocked
              ? 'border-red-500/30 bg-red-500/10 text-red-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          }`}
        >
          {isPending
            ? 'Your account is pending vendor approval. You will be able to go online once a vendor approves your signup.'
            : `Your account has been ${data.status}. Please contact your vendor for more information.`}
        </motion.div>
      )}

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.06] p-6 backdrop-blur-sm">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <span className="font-display text-base font-semibold text-white/80">Online Status</span>
              <button
                onClick={handleToggleOnline}
                disabled={toggling || isPending || isBlocked}
                className={`relative h-12 w-[72px] rounded-full transition-colors duration-300 ${
                  data.isOnline
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.4)]'
                    : 'bg-white/10'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <motion.span
                  layout
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className={`absolute top-1.5 h-9 w-9 rounded-full bg-white shadow-lg ${
                    data.isOnline ? 'left-[42px]' : 'left-1.5'
                  }`}
                />
              </button>
              {data.isOnline && (
                <motion.span
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="font-body text-sm font-medium text-emerald-400"
                >
                  Active
                </motion.span>
              )}
            </div>

            <div className="flex items-center gap-4">
              <span className="font-display text-base font-semibold text-white/80">Available for Orders</span>
              <button
                onClick={handleToggleAvailable}
                disabled={toggling || !data.isOnline || isPending || isBlocked}
                className={`relative h-12 w-[72px] rounded-full transition-colors duration-300 ${
                  data.isAvailable && data.isOnline
                    ? 'bg-gradient-to-r from-brand-cyan to-brand-teal shadow-glow-cyan'
                    : 'bg-white/10'
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <motion.span
                  layout
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className={`absolute top-1.5 h-9 w-9 rounded-full bg-white shadow-lg ${
                    data.isAvailable && data.isOnline ? 'left-[42px]' : 'left-1.5'
                  }`}
                />
              </button>
              {data.isAvailable && data.isOnline && (
                <motion.span
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="font-body text-sm font-medium text-brand-cyan"
                >
                  Accepting
                </motion.span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard label="Today's Deliveries" value={data.todayDeliveries} icon={Timer} delay={0.1} />
        <StatsCard label="Today's Earnings" value={`₹${data.todayEarnings}`} icon={IndianRupee} delay={0.15} />
        <StatsCard label="Total Earned" value={`₹${data.totalEarned}`} icon={Wallet} accent delay={0.2} />
        <StatsCard label="Total Deliveries" value={data.totalDeliveries} icon={Package} delay={0.25} />
      </div>
      <p className="-mt-3 font-body text-xs text-white/40">
        Delivery fee: ₹{data.deliveryFees?.fee5km ?? 600} per delivery up to 5 km · ₹{data.deliveryFees?.fee7km ?? 700} per delivery within 7 km
      </p>

      {data.pendingRequests.length > 0 && (
        <div>
          <h3 className="mb-4 font-display text-lg font-semibold text-white">
            Pending Requests
            <span className="ml-2 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-amber-500/20 px-2 text-xs font-bold text-amber-300">
              {data.pendingRequests.length}
            </span>
          </h3>
          <div className="space-y-3">
            {data.pendingRequests.map((r, i) => (
              <RequestCard key={r.assignmentId} request={r} index={i} onActionDone={load} compact />
            ))}
          </div>
        </div>
      )}

      {data.activeDelivery && (
        <div>
          <h3 className="mb-4 font-display text-lg font-semibold text-white">Active Delivery</h3>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.01 }}
            className="flex items-center justify-between rounded-2xl border border-brand-cyan/20 bg-gradient-to-br from-brand-blue/10 to-brand-teal/10 p-5 shadow-glow-cyan"
          >
            <div>
              <span className="font-display text-lg font-bold text-white">#{data.activeDelivery.orderNumber}</span>
              <span className="ml-3 font-body text-sm text-white/60">{formatStatus(data.activeDelivery.status)}</span>
            </div>
            <GradientButton onClick={() => onNavigate('active')} size="md">
              View Details
            </GradientButton>
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}

function RequestsPanel() {
  const [requests, setRequests] = useState<DeliveryAssignment[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getDeliveryRequests()
    if (res.success) setRequests(res.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <motion.div {...fadeSlide} className="space-y-4">
        <SkeletonLoader variant="list" count={2} />
      </motion.div>
    )
  }

  return (
    <motion.div {...fadeSlide} className="space-y-4">
      <h2 className="font-display text-2xl font-bold text-white">Delivery Requests</h2>
      <AnimatePresence>
        {requests.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No pending requests"
            description="You'll see new delivery requests here when vendors assign orders to you."
          />
        ) : (
          requests.map((r, i) => (
            <RequestCard key={r.assignmentId} request={r} index={i} onActionDone={load} />
          ))
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function RequestCard({ request: r, index, onActionDone, compact }: {
  request: DeliveryAssignment
  index: number
  onActionDone: () => void
  compact?: boolean
}) {
  const [busy, setBusy] = useState(false)

  const handleAccept = async () => {
    setBusy(true)
    await acceptDeliveryRequest(r.assignmentId)
    onActionDone()
    setBusy(false)
  }

  const handleReject = async () => {
    setBusy(true)
    await rejectDeliveryRequest(r.assignmentId)
    onActionDone()
    setBusy(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20, transition: { duration: 0.2 } }}
      transition={{ delay: index * 0.05 }}
      className="rounded-2xl border border-white/[0.08] bg-white/[0.06] p-5 backdrop-blur-sm"
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <span className="font-display text-lg font-bold text-white">#{r.orderNumber}</span>
          <div className="mt-1 flex items-center gap-2 text-sm text-white/50">
            <Building2 className="h-3.5 w-3.5" />
            <span className="font-body">{r.vendorCompany}</span>
          </div>
        </div>
        {r.expiresAt && (
          <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1">
            <Timer className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-body text-xs font-medium text-amber-300">
              {new Date(r.expiresAt).toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-3 text-sm text-white/60">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-brand-cyan" />
          <span className="font-body">{r.deliveryAreaName}, {r.deliveryCity}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Droplets className="h-3.5 w-3.5 text-brand-teal" />
          <span className="font-body">{r.quantity}x {r.tankerTypeName} ({r.capacityLitres}L)</span>
        </div>
      </div>

      <div className="flex gap-3">
        <GradientButton onClick={handleAccept} disabled={busy} size={compact ? 'md' : 'lg'}>
          <CheckCircle2 className="h-4 w-4" />
          Accept
        </GradientButton>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleReject}
          disabled={busy}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 font-body font-semibold text-red-400 transition-all hover:border-red-500/50 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50 ${
            compact ? 'px-5 py-2.5 text-sm' : 'px-6 py-3 text-base'
          }`}
        >
          <XCircle className="h-4 w-4" />
          Reject
        </motion.button>
      </div>
    </motion.div>
  )
}

function ActivePanel() {
  const [dashboard, setDashboard] = useState<DeliveryDashboard | null>(null)
  const [orderDetail, setOrderDetail] = useState<DeliveryOrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [advancing, setAdvancing] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [myPos, setMyPos] = useState<{ latitude: number; longitude: number } | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      pos => setMyPos({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const dashRes = await getDeliveryDashboard()
    if (dashRes.success) {
      setDashboard(dashRes.data)
      if (dashRes.data.activeDelivery) {
        const detailRes = await getDeliveryOrderDetail(dashRes.data.activeDelivery.id)
        if (detailRes.success) setOrderDetail(detailRes.data)
      } else {
        setOrderDetail(null)
        setOtp('')
        setOtpError('')
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const currentIdx = orderDetail ? FLOW_STEPS.indexOf(orderDetail.status as typeof FLOW_STEPS[number]) : -1
  const nextStatus = currentIdx >= 0 && currentIdx < FLOW_STEPS.length - 1 ? FLOW_STEPS[currentIdx + 1] : null

  const handleAdvance = async () => {
    if (!orderDetail || !nextStatus || advancing) return
    setAdvancing(true)
    await advanceDeliveryStatus(orderDetail.id, nextStatus)
    await load()
    setAdvancing(false)
  }

  const handleConfirmOtp = async () => {
    if (!orderDetail || !otp.trim()) { setOtpError('Enter OTP'); return }
    setOtpLoading(true)
    setOtpError('')
    const res = await confirmDeliveryOtp(orderDetail.id, otp.trim())
    if (res.success) {
      setOtp('')
      await load()
    } else {
      setOtpError(res.error)
    }
    setOtpLoading(false)
  }

  const handleGenerateOtp = async () => {
    if (!orderDetail) return
    const res = await generateDeliveryOtp(orderDetail.id)
    if (res.success && res.data.devOtp) {
      setOtp(res.data.devOtp)
    }
  }

  const handleCopyOtp = () => {
    if (otp) {
      navigator.clipboard.writeText(otp)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  if (loading) {
    return (
      <motion.div {...fadeSlide} className="space-y-6">
        <SkeletonLoader variant="card" count={2} />
      </motion.div>
    )
  }

  if (!dashboard?.activeDelivery || !orderDetail) {
    return (
      <motion.div {...fadeSlide}>
        <EmptyState
          icon={Truck}
          title="No active delivery"
          description="Accept a delivery request to get started."
        />
      </motion.div>
    )
  }

  const pickupAddr = [orderDetail.pickup.street, orderDetail.pickup.area, orderDetail.pickup.city].filter(Boolean).join(', ')
  const deliveryAddr = [orderDetail.delivery.doorNo, orderDetail.delivery.streetName, orderDetail.delivery.areaName, orderDetail.delivery.city, orderDetail.delivery.state].filter(Boolean).join(', ')
  const linkBtn = 'inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 font-body text-xs font-semibold text-white/70 transition-colors hover:bg-white/20 hover:text-white'

  return (
    <motion.div {...fadeSlide} className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-2xl font-bold text-white">
          #{orderDetail.orderNumber}
        </h2>
        <StatusBadge status={orderDetail.status} />
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.06] p-6 backdrop-blur-sm">
        <h3 className="mb-5 font-display text-sm font-semibold uppercase tracking-wider text-white/50">Delivery Progress</h3>
        <OrderTimeline steps={DELIVERY_STEPS} currentStatus={orderDetail.status} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.06] p-5 backdrop-blur-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-cyan/20">
              <MapPinned className="h-4 w-4 text-brand-cyan" />
            </div>
            <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-white/50">Pickup Location</h4>
          </div>
          <p className="font-body text-sm font-semibold text-white">{orderDetail.pickup.company}</p>
          <p className="mt-1 font-body text-sm text-white/60">{pickupAddr}</p>
          <div className="mt-3">
            <a href={openInMaps(pickupAddr)} target="_blank" rel="noreferrer" className={linkBtn}>
              <MapPin className="h-3.5 w-3.5 text-brand-cyan" /> View on Map
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.06] p-5 backdrop-blur-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-teal/20">
              <MapPin className="h-4 w-4 text-brand-teal" />
            </div>
            <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-white/50">Delivery Location</h4>
          </div>
          <p className="font-body text-sm font-semibold text-white">{orderDetail.customerName}</p>
          <p className="mt-1 font-body text-sm text-white/60">{deliveryAddr}</p>
          {orderDetail.customerPhone && (
            <p className="mt-1 font-body text-xs text-white/40">{orderDetail.customerPhone}</p>
          )}
          <div className="mt-3">
            <a href={openInMaps(deliveryAddr)} target="_blank" rel="noreferrer" className={linkBtn}>
              <MapPin className="h-3.5 w-3.5 text-brand-teal" /> View on Map
            </a>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.06] p-5 backdrop-blur-sm">
        <h4 className="mb-2 font-display text-xs font-semibold uppercase tracking-wider text-white/50">Order Details</h4>
        <p className="font-body text-sm text-white/80">
          {orderDetail.items.quantity}x {orderDetail.items.tankerTypeName} ({orderDetail.items.capacityLitres}L)
        </p>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.06] p-5 backdrop-blur-sm">
        <h4 className="mb-2 font-display text-xs font-semibold uppercase tracking-wider text-white/50">Delivery Fee</h4>
        <p className="font-body text-sm text-white/80">
          You earn <span className="font-bold text-emerald-400">₹{dashboard.deliveryFees?.fee5km ?? 600}</span> for deliveries up to 5 km and{' '}
          <span className="font-bold text-emerald-400">₹{dashboard.deliveryFees?.fee7km ?? 700}</span> for deliveries within 7 km.
        </p>
      </div>

      <div className="rounded-2xl border border-brand-cyan/20 bg-gradient-to-br from-brand-blue/10 to-brand-teal/10 p-6 shadow-glow-cyan">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-cyan/20">
            <MapPinned className="h-5 w-5 text-brand-cyan" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-white">Live Tracking</p>
            <p className="font-body text-xs text-white/50">
              {myPos
                ? 'Your live position is shared with the customer and vendor.'
                : 'Waiting for GPS fix — keep this tab open while delivering.'}
            </p>
          </div>
        </div>

        {myPos ? (
          <>
            <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
              <iframe
                src={routeEmbed(myPos, deliveryAddr)}
                title="Route to delivery location"
                className="h-48 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={directions(myPos, deliveryAddr)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-cyan/20 px-4 py-2.5 font-body text-sm font-semibold text-white transition-colors hover:bg-brand-cyan/30"
              >
                <Navigation className="h-4 w-4 text-brand-cyan" /> Get Directions
              </a>
              <a
                href={openInMaps(deliveryAddr)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 font-body text-sm font-semibold text-white transition-colors hover:bg-white/20"
              >
                <ExternalLink className="h-4 w-4 text-brand-cyan" /> View Delivery on Maps
              </a>
            </div>
          </>
        ) : (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 font-body text-xs text-white/50">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Acquiring GPS location…
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {nextStatus && nextStatus !== 'delivered' && (
          <GradientButton onClick={handleAdvance} disabled={advancing} size="lg">
            <Truck className="h-5 w-5" />
            {advancing ? 'Updating...' : `Mark as ${formatStatus(nextStatus)}`}
          </GradientButton>
        )}

        {nextStatus === 'delivered' && (
          <GradientButton onClick={handleAdvance} disabled={advancing} size="lg">
            <Truck className="h-5 w-5" />
            {advancing ? 'Updating...' : 'Mark as Arrived at Customer'}
          </GradientButton>
        )}
      </div>

      {(nextStatus === 'delivered' || orderDetail.status === 'arrived_at_customer') && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-white/[0.08] bg-white/[0.06] p-6 backdrop-blur-sm"
        >
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand-cyan" />
            <h4 className="font-display text-base font-semibold text-white">Confirm Delivery with OTP</h4>
          </div>
          <div className="flex gap-3">
            <input
              value={otp}
              onChange={e => setOtp(e.target.value)}
              placeholder="Enter 6-digit OTP"
              maxLength={6}
              className="flex-1 rounded-xl border border-white/[0.12] bg-white/[0.06] px-4 py-3 font-display text-lg font-bold tracking-[0.3em] text-white text-center outline-none transition-colors placeholder:text-white/20 focus:border-brand-cyan/50 focus:shadow-glow-cyan"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCopyOtp}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.06] text-white/50 transition-colors hover:text-white"
            >
              {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleGenerateOtp}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.06] text-white/50 transition-colors hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
            </motion.button>
          </div>
          {otpError && (
            <p className="mt-2 font-body text-sm text-red-400">{otpError}</p>
          )}
          <div className="mt-4">
            <GradientButton onClick={handleConfirmOtp} disabled={otpLoading} size="lg" className="w-full">
              <ShieldCheck className="h-5 w-5" />
              {otpLoading ? 'Verifying...' : 'Confirm Delivery'}
            </GradientButton>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

function HistoryPanel() {
  const [items, setItems] = useState<DeliveryListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDeliveryDeliveries().then(res => {
      if (res.success) setItems(res.data)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <motion.div {...fadeSlide} className="space-y-4">
        <SkeletonLoader variant="list" count={3} />
      </motion.div>
    )
  }

  return (
    <motion.div {...fadeSlide} className="space-y-4">
      <h2 className="font-display text-2xl font-bold text-white">Delivery History</h2>
      {items.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No delivery history yet"
          description="Your completed deliveries will appear here."
        />
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <HistoryCard key={item.id} item={item} index={i} />
          ))}
        </div>
      )}
    </motion.div>
  )
}

function HistoryCard({ item, index }: { item: DeliveryListItem; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const date = item.deliveredAt || item.createdAt

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-2xl border border-white/[0.08] bg-white/[0.06] backdrop-blur-sm transition-colors hover:bg-white/[0.08]"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="font-display text-base font-bold text-white">#{item.orderNumber}</span>
            <StatusBadge status={item.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-white/50">
            <span className="font-body">{item.deliveryAreaName}, {item.deliveryCity}</span>
            <span className="font-body">{item.quantity}x {item.tankerTypeName}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-body text-xs text-white/30">
            {new Date(date).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
        </div>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06] px-5 pb-5 pt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-body text-xs text-white/40">Customer</span>
                  <p className="mt-0.5 font-body font-medium text-white/80">{item.customerName}</p>
                </div>
                <div>
                  <span className="font-body text-xs text-white/40">Tanker</span>
                  <p className="mt-0.5 font-body font-medium text-white/80">{item.tankerTypeName} ({item.quantity}x)</p>
                </div>
                <div>
                  <span className="font-body text-xs text-white/40">Delivered At</span>
                  <p className="mt-0.5 font-body font-medium text-white/80">
                    {item.deliveredAt ? new Date(item.deliveredAt).toLocaleString() : '—'}
                  </p>
                </div>
                <div>
                  <span className="font-body text-xs text-white/40">Created</span>
                  <p className="mt-0.5 font-body font-medium text-white/80">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function EarningsPanel() {
  const [data, setData] = useState<DeliveryEarnings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDeliveryEarnings().then(res => {
      if (res.success) setData(res.data)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <motion.div {...fadeSlide} className="space-y-6">
        <SkeletonLoader variant="stat" />
        <SkeletonLoader variant="card" count={2} />
      </motion.div>
    )
  }

  if (!data) {
    return (
      <motion.div {...fadeSlide}>
        <EmptyState icon={Wallet} title="Failed to load earnings" description="Please try again later." />
      </motion.div>
    )
  }

  const chartData = [...data.history]
    .reverse()
    .map(e => ({
      date: e.deliveredAt ? new Date(e.deliveredAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : '',
      earnings: e.earnings,
    }))

  return (
    <motion.div {...fadeSlide} className="space-y-6">
      <h2 className="font-display text-2xl font-bold text-white">Earnings</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard label="Total Earned" value={`₹${data.totalEarned}`} icon={Wallet} accent delay={0.1} />
        <StatsCard label="This Month" value={`₹${data.thisMonth}`} icon={IndianRupee} delay={0.15} />
        <StatsCard label="This Week" value={`₹${data.thisWeek}`} icon={Timer} delay={0.2} />
        <StatsCard label="Per Delivery" value={`₹${data.deliveryFees?.fee5km ?? data.earningsPerDelivery} / ₹${data.deliveryFees?.fee7km ?? data.earningsPerDelivery}`} icon={Package} delay={0.25} />
      </div>
      <p className="-mt-3 font-body text-xs text-white/40">
        ₹{(data.deliveryFees?.fee5km ?? data.earningsPerDelivery)} per delivery up to 5 km · ₹{(data.deliveryFees?.fee7km ?? data.earningsPerDelivery)} per delivery within 7 km
      </p>

      {chartData.length > 0 && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.06] p-6 backdrop-blur-sm">
          <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-white/50">Earnings Over Time</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15,23,42,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    color: '#fff',
                    fontFamily: 'Inter',
                    fontSize: 13,
                  }}
                  formatter={(value) => [`₹${value}`, 'Earnings']}
                />
                <Area type="monotone" dataKey="earnings" stroke="#06b6d4" strokeWidth={2} fill="url(#earningsGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {data.history.length > 0 && (
        <div>
          <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-white/50">Recent Deliveries</h3>
          <div className="space-y-2">
            {data.history.map((h, i) => (
              <motion.div
                key={h.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.04] px-4 py-3"
              >
                <div>
                  <span className="font-display text-sm font-semibold text-white">#{h.orderNumber}</span>
                  <span className="ml-2 font-body text-xs text-white/40">{h.area}, {h.city}</span>
                  {h.distanceKm != null && (
                    <span className="ml-2 font-body text-xs text-white/30">{formatDistanceKm(h.distanceKm)}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-body text-xs text-white/30">
                    {h.deliveredAt ? new Date(h.deliveredAt).toLocaleDateString() : '—'}
                  </span>
                  <span className="font-display text-sm font-bold text-emerald-400">+₹{h.earnings}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}
