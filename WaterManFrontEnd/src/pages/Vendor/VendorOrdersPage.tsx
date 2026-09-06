import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Inbox, Package, Wallet, Truck, Users,
  MapPin, Phone, Mail, Clock, Zap, ChevronDown,
  CheckCircle, XCircle, Key, RefreshCw, Settings, Wifi,
  WifiOff, TrendingUp, ShoppingBag, IndianRupee, BarChart3,
  Plus, Trash2, Edit3, UserPlus, ShieldCheck, Pause,
  Play, Navigation
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { getVendorOrders, acceptOrder, rejectOrder, updateOrderStatus, getVendorEarnings, setVendorWorkMode, getMyTankers, addTanker, updateTanker, toggleTankerActive, deleteTanker, getVendorDeliveryPartners, addVendorDeliveryPartner, updateVendorDeliveryPartnerStatus, removeVendorDeliveryPartner, getVendorDeliverySettings, updateVendorDeliverySettings, getAvailableDeliveryPartners, assignDeliveryPartner, autoAssignDeliveryPartner, generateDeliveryOtp, getUnassignedDeliveryPartners, claimDeliveryPartner } from '../../utils/api'
import { routeEmbed, pointEmbed, openInMaps } from '../../utils/maps'
import type { VendorEarnings } from '../../utils/api'
import { connectSocket } from '../../utils/socket'
import type { VendorOrder, VendorTanker, VendorDeliveryPartner, DeliverySettings, AddDeliveryPartnerInput } from '../../types'
import { useNav } from '../../context/NavigationContext'
import DashboardLayout from '../../components/dashboard/DashboardLayout'
import type { NavItem } from '../../components/dashboard/DashboardLayout'
import StatsCard from '../../components/dashboard/StatsCard'
import StatusBadge from '../../components/dashboard/StatusBadge'
import SkeletonLoader from '../../components/dashboard/SkeletonLoader'
import EmptyState from '../../components/dashboard/EmptyState'
import GradientButton from '../../components/dashboard/GradientButton'
import './VendorOrdersPage.css'

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Awaiting Acceptance', accepted: 'Accepted', preparing: 'Preparing',
  ready_for_pickup: 'Ready for Pickup', assigned: 'Partner Assigned',
  delivery_accepted: 'Delivery Accepted', arrived_at_pickup: 'Arrived at Pickup',
  picked_up: 'Picked Up', out_for_delivery: 'Out for Delivery',
  arrived_at_customer: 'Arrived at Customer', delivered: 'Delivered',
  rejected: 'Rejected', failed: 'Failed', cancelled: 'Cancelled',
}

const NEXT_STATUS: Record<string, { label: string; next: string } | null> = {
  accepted: { label: 'Mark Preparing', next: 'preparing' },
  preparing: { label: 'Mark Ready for Pickup', next: 'ready_for_pickup' },
  delivered: null, rejected: null,
}

const DELIVERY_HANDLED: Record<string, boolean> = {
  assigned: true, delivery_accepted: true, arrived_at_pickup: true,
  picked_up: true, out_for_delivery: true, arrived_at_customer: true,
}

function formatAddr(o: VendorOrder): string {
  return [o.deliveryDoorNo, o.deliveryPlotNo, o.deliveryBuildingName, o.deliveryStreetName, o.deliveryAreaName, o.deliveryCity, o.deliveryState].filter(Boolean).join(', ')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function mapsUrl(o: VendorOrder): string {
  const addr = [o.deliveryDoorNo, o.deliveryPlotNo, o.deliveryBuildingName, o.deliveryStreetName, o.deliveryAreaName, o.deliveryCity, o.deliveryState].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [onClose])
  return (
    <motion.div
      initial={{ opacity: 0, y: -20, x: '-50%' }}
      animate={{ opacity: 1, y: 0, x: '-50%' }}
      exit={{ opacity: 0, y: -20, x: '-50%' }}
      className="fixed top-20 left-1/2 z-[200] bg-gradient-to-r from-brand-blue via-brand-cyan to-brand-teal text-white px-6 py-3 rounded-2xl font-semibold text-sm shadow-glow-cyan max-w-[90vw] text-center"
    >
      {message}
    </motion.div>
  )
}

function OrderCard({ order, mode, onAccept, onReject, onStatus, busy, onAssign, onAutoAssign, showToast, liveLocation }: {
  order: VendorOrder; mode: 'available' | 'mine'; onAccept: (id: string) => Promise<void>; onReject: (id: string) => Promise<void>
  onStatus: (id: string, status: string) => Promise<void>; busy: boolean; onAssign: (id: string, partnerId: string) => Promise<boolean>
  onAutoAssign: (id: string) => Promise<boolean>; showToast: (msg: string) => void
  liveLocation?: { latitude: number; longitude: number; updatedAt: string } | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [partners, setPartners] = useState<VendorDeliveryPartner[] | null>(null)
  const [loadingPartners, setLoadingPartners] = useState(false)
  const [selected, setSelected] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [generatingOtp, setGeneratingOtp] = useState(false)
  const next = NEXT_STATUS[order.status] ?? null
  const canGenerateOtp = order.status === 'out_for_delivery' || order.status === 'arrived_at_customer'

  async function handleGenerateOtp() {
    if (generatingOtp) return
    setGeneratingOtp(true)
    const res = await generateDeliveryOtp(order.id)
    setGeneratingOtp(false)
    if (res.success) {
      showToast(res.data?.devOtp ? `Delivery OTP: ${res.data.devOtp}` : 'OTP generated. Customer notified.')
    } else {
      showToast(res.error)
    }
  }

  async function loadPartners() {
    if (partners) return
    setLoadingPartners(true)
    const res = await getAvailableDeliveryPartners(order.id)
    if (res.success) setPartners(res.data)
    setLoadingPartners(false)
  }

  async function handleAssign() {
    if (!selected || assigning) return
    setAssigning(true)
    const ok = await onAssign(order.id, selected)
    setAssigning(false)
    if (ok) { setSelected(''); setPartners(null) }
  }

  async function handleAutoAssign() {
    if (assigning) return
    setAssigning(true)
    const ok = await onAutoAssign(order.id)
    setAssigning(false)
    if (ok) { setSelected(''); setPartners(null) }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: mode === 'available' ? -100 : 0, scale: mode === 'available' ? 0.95 : 1 }}
      className="bg-white/[0.06] border border-white/[0.08] rounded-2xl p-5 hover:border-white/[0.12] transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-display font-bold text-white text-base">#{order.orderNumber}</span>
          <StatusBadge status={order.status} />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-white/30">{formatDate(order.createdAt)}</span>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }}>
            <ChevronDown size={16} className="text-white/25" />
          </motion.div>
        </div>
      </div>

      <div className="flex items-start gap-2 mb-2">
        <MapPin size={14} className="text-brand-cyan mt-0.5 flex-shrink-0" />
        <p className="text-sm text-white/55 leading-relaxed">{formatAddr(order)}</p>
      </div>

      {order.scheduledAt ? (
        <div className="flex items-center gap-2 text-xs text-amber-400 mb-3">
          <Clock size={13} />
          <span>Scheduled: {formatDate(order.scheduledAt)}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-brand-cyan mb-3">
          <Zap size={13} />
          <span>ASAP Delivery</span>
        </div>
      )}

      {mode === 'mine' && (
        <div className="border-t border-white/[0.06] pt-3 mt-1 space-y-2">
          <div className="flex items-center gap-2 text-sm text-white/70">
            <div className="w-7 h-7 rounded-full bg-brand-cyan/15 flex items-center justify-center">
              <Users size={14} className="text-brand-cyan" />
            </div>
            <span className="font-semibold text-white">{order.customerName}</span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-white/50">
            {order.customerPhone && (
              <a href={`tel:${order.customerPhone}`} className="flex items-center gap-1.5 text-brand-cyan hover:underline">
                <Phone size={12} /> {order.customerPhone}
              </a>
            )}
            {order.customerEmail && (
              <span className="flex items-center gap-1.5"><Mail size={12} /> {order.customerEmail}</span>
            )}
          </div>
          <a href={mapsUrl(order)} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium mt-1">
            <Navigation size={12} /> Open in Maps
          </a>
        </div>
      )}

      {mode === 'mine' && DELIVERY_HANDLED[order.status] && (
        (() => {
          const live = liveLocation ?? (order.deliveryPartnerLatitude != null && order.deliveryPartnerLongitude != null
            ? { latitude: order.deliveryPartnerLatitude, longitude: order.deliveryPartnerLongitude }
            : null)
          const addr = formatAddr(order)
          const mapSrc = live ? routeEmbed(live, addr) : pointEmbed(addr)
          return (
            <div className="border-t border-white/[0.06] pt-3 mt-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm text-white/80">
                  <Truck size={16} className="text-brand-teal" />
                  <span>Delivery partner: <span className="font-semibold text-white">{order.deliveryPartnerName ?? 'Assigned'}</span></span>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${live ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/10 text-white/40'}`}>
                  {liveLocation ? 'Live' : live ? 'Last known' : 'No location'}
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
                <iframe src={mapSrc} title="Delivery partner location" className="h-40 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              </div>
              <a href={openInMaps(live ?? addr)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium mt-2">
                <Navigation size={12} /> Track partner on Google Maps
              </a>
            </div>
          )
        })()
      )}

      <AnimatePresence>
        {expanded && mode === 'available' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06] pt-3 mt-2">
              <div className="flex items-center gap-2 text-sm text-white/60 mb-2">
                <Users size={14} /> {order.customerName}
              </div>
              <a href={mapsUrl(order)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium">
                <Navigation size={12} /> Open in Maps
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap gap-2 mt-4">
        {mode === 'available' && (
          <>
            <GradientButton variant="primary" size="sm" onClick={() => onAccept(order.id)} disabled={busy}>
              <CheckCircle size={14} /> Accept
            </GradientButton>
            <GradientButton variant="danger" size="sm" onClick={() => onReject(order.id)} disabled={busy}>
              <XCircle size={14} /> Reject
            </GradientButton>
          </>
        )}

        {mode === 'mine' && next && (
          <GradientButton variant="primary" size="sm" onClick={() => onStatus(order.id, next.next)} disabled={busy}>
            <CheckCircle size={14} /> {next.label}
          </GradientButton>
        )}

        {mode === 'mine' && order.status === 'accepted' && (
          <GradientButton variant="danger" size="sm" onClick={() => onReject(order.id)} disabled={busy}>
            <XCircle size={14} /> Reject
          </GradientButton>
        )}

        {mode === 'mine' && order.status === 'ready_for_pickup' && (
          <div className="w-full space-y-3 mt-1">
            <div className="flex flex-wrap gap-2">
              <GradientButton variant="outline" size="sm" onClick={loadPartners} disabled={busy || loadingPartners}>
                {loadingPartners ? 'Loading...' : partners ? 'Select Partner' : 'Assign Partner'}
              </GradientButton>
              <GradientButton variant="ghost" size="sm" onClick={handleAutoAssign} disabled={busy || assigning}>
                <Zap size={14} /> Auto-assign
              </GradientButton>
            </div>
            <AnimatePresence>
              {partners && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 space-y-2">
                    {partners.length === 0 ? (
                      <p className="text-sm text-white/40 text-center py-3">No partners online right now.</p>
                    ) : (
                      partners.map(p => (
                        <motion.div
                          key={p.id}
                          whileHover={{ x: 2 }}
                          onClick={() => setSelected(p.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                            selected === p.id
                              ? 'border-brand-cyan/50 bg-brand-cyan/5'
                              : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold text-white">{p.firstName} {p.lastName}</span>
                            <span className={`text-[10px] font-bold uppercase ${p.isOnline ? 'text-emerald-400' : 'text-white/30'}`}>
                              {p.isOnline ? 'Online' : 'Offline'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-white/45">
                            <span className="flex items-center gap-1"><Phone size={11} /> {p.phone}</span>
                            {p.vehicleType && <span>{p.vehicleType}{p.vehicleNumber ? ` (${p.vehicleNumber})` : ''}</span>}
                            <span className={p.isAvailable ? 'text-emerald-400' : 'text-white/30'}>
                              {p.isAvailable ? 'Available' : 'Busy'}
                            </span>
                          </div>
                          {selected === p.id && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 pt-2 border-t border-white/[0.06]">
                              <GradientButton variant="primary" size="sm" onClick={() => { handleAssign() }} disabled={!selected || assigning || busy} loading={assigning}>
                                Assign Partner
                              </GradientButton>
                            </motion.div>
                          )}
                        </motion.div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {mode === 'mine' && DELIVERY_HANDLED[order.status] && (
          canGenerateOtp ? (
            <GradientButton variant="outline" size="sm" onClick={handleGenerateOtp} disabled={busy || generatingOtp} loading={generatingOtp}>
              <Key size={14} /> Generate OTP
            </GradientButton>
          ) : (
            <span className="text-xs text-white/30 italic self-center">Delivery partner managing</span>
          )
        )}
      </div>
    </motion.div>
  )
}

function OverviewTab({ available, mine, earnings, onToggleMode }: {
  available: VendorOrder[]; mine: VendorOrder[]; earnings: VendorEarnings | null; onToggleMode: () => void
}) {
  const totalOrders = available.length + mine.length
  const activeOrders = mine.filter(o => !['delivered', 'rejected', 'cancelled', 'failed'].includes(o.status)).length
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`

  const statusCounts: Record<string, number> = {}
  mine.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1 })
  const barData = Object.entries(statusCounts).map(([status, count]) => ({
    name: STATUS_LABELS[status] ?? status,
    count,
  }))

  const weeklyData = DAYS.map((day, i) => ({
    day,
    revenue: Math.floor(Math.random() * 3000 + 800 + i * 200),
    orders: Math.floor(Math.random() * 8 + 2),
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard label="Total Orders" value={totalOrders} icon={ShoppingBag} accent delay={0} />
        <StatsCard label="Active Orders" value={activeOrders} icon={Package} delay={0.1} />
        <StatsCard label="Total Earned" value={earnings ? fmt(earnings.totalEarned) : '---'} icon={IndianRupee} accent delay={0.2} />
        <StatsCard label="This Month" value={earnings ? fmt(earnings.thisMonth) : '---'} icon={TrendingUp} trend={earnings?.thisWeek ? `${fmt(earnings.thisWeek)} this week` : undefined} delay={0.3} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white/[0.06] border border-white/[0.08] rounded-2xl p-5">
          <h3 className="font-display font-semibold text-white/80 text-sm mb-4">Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#0f1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', fontSize: 12 }}
                labelStyle={{ color: 'rgba(255,255,255,0.5)' }}
              />
              <Area type="monotone" dataKey="revenue" stroke="#06b6d4" strokeWidth={2} fill="url(#colorRevenue)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white/[0.06] border border-white/[0.08] rounded-2xl p-5">
          <h3 className="font-display font-semibold text-white/80 text-sm mb-4">Orders by Status</h3>
          {barData.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-white/30">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData}>
                <defs>
                  <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" height={60} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#0f1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', fontSize: 12 }}
                />
                <Bar dataKey="count" fill="url(#colorBar)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white/[0.06] border border-white/[0.08] rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${earnings?.isOnline ? 'bg-emerald-500/15' : 'bg-white/[0.06]'}`}>
              {earnings?.isOnline ? <Wifi size={18} className="text-emerald-400" /> : <WifiOff size={18} className="text-white/30" />}
            </div>
            <div>
              <h3 className="font-display font-semibold text-white/80 text-sm">Work Mode</h3>
              <p className="text-xs text-white/40">{earnings?.isOnline ? 'Online - accepting orders' : 'Offline - not taking orders'}</p>
            </div>
          </div>
          <button
            onClick={onToggleMode}
            className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
              earnings?.isOnline ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'bg-white/10'
            }`}
          >
            <motion.div
              animate={{ x: earnings?.isOnline ? 28 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-lg"
            />
          </button>
        </div>
      </div>
    </div>
  )
}

function EarningsTab({ earnings }: { earnings: VendorEarnings }) {
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`
  const lineData = DAYS.map((day, i) => ({
    day,
    earnings: Math.floor(Math.random() * 1500 + 300 + i * 150),
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard label="Total Earned" value={fmt(earnings.totalEarned)} icon={IndianRupee} accent delay={0} />
        <StatsCard label="This Month" value={fmt(earnings.thisMonth)} icon={TrendingUp} delay={0.1} />
        <StatsCard label="This Week" value={fmt(earnings.thisWeek)} icon={Wallet} delay={0.2} />
        <StatsCard label="Total Deliveries" value={earnings.totalDeliveries} icon={Truck} delay={0.3} />
      </div>

      <div className="bg-white/[0.06] border border-white/[0.08] rounded-2xl p-5">
        <h3 className="font-display font-semibold text-white/80 text-sm mb-4">Earnings Trend</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={lineData}>
            <defs>
              <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#0f1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', fontSize: 12 }}
            />
            <Line type="monotone" dataKey="earnings" stroke="#2dd4bf" strokeWidth={2.5} dot={{ fill: '#2dd4bf', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, stroke: '#2dd4bf', strokeWidth: 2, fill: '#051525' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white/[0.06] border border-white/[0.08] rounded-2xl p-5">
        <h3 className="font-display font-semibold text-white/80 text-sm mb-3">Active Orders</h3>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-display font-bold bg-gradient-to-r from-brand-cyan to-brand-teal bg-clip-text text-transparent">
            {earnings.activeOrders}
          </span>
          <span className="text-xs text-white/35">currently in progress</span>
        </div>
      </div>
    </div>
  )
}

function FleetTab() {
  const [tankers, setTankers] = useState<VendorTanker[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<VendorTanker | 'new' | null>(null)
  const [form, setForm] = useState({ registrationNo: '', capacityLiters: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await getMyTankers()
    if (res.success) setTankers(res.data)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function openNew() { setForm({ registrationNo: '', capacityLiters: '', notes: '' }); setFormErr(''); setEditing('new') }
  function openEdit(t: VendorTanker) { setForm({ registrationNo: t.registrationNo, capacityLiters: String(t.capacityLiters), notes: t.notes ?? '' }); setFormErr(''); setEditing(t) }

  async function handleSave() {
    if (!form.registrationNo.trim()) { setFormErr('Registration number is required'); return }
    const cap = parseInt(form.capacityLiters, 10)
    if (!cap || cap <= 0) { setFormErr('Capacity must be a positive number'); return }
    setSaving(true)
    const payload = { registrationNo: form.registrationNo.trim(), capacityLiters: cap, notes: form.notes.trim() || undefined }
    const res = editing === 'new' ? await addTanker(payload) : await updateTanker((editing as VendorTanker).id, payload)
    setSaving(false)
    if (res.success) { setEditing(null); await load() } else { setFormErr(res.error) }
  }

  async function handleToggle(id: string) {
    const res = await toggleTankerActive(id)
    if (res.success) setTankers(prev => prev.map(t => t.id === id ? { ...t, isActive: res.data.isActive } : t))
  }

  async function confirmAndDelete(id: string) {
    setConfirmDelete(null)
    const res = await deleteTanker(id)
    if (res.success) setTankers(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-white text-lg">My Fleet</h2>
        <GradientButton variant="primary" size="sm" onClick={openNew}>
          <Plus size={14} /> Add Tanker
        </GradientButton>
      </div>

      {loading ? (
        <SkeletonLoader count={2} variant="card" />
      ) : tankers.length === 0 ? (
        <EmptyState icon={Truck} title="No tankers yet" description="Add your first tanker to start accepting deliveries." action={{ label: 'Add Tanker', onClick: openNew }} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <AnimatePresence>
            {tankers.map(t => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: t.isActive ? 1 : 0.5, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`bg-white/[0.06] border rounded-2xl p-5 ${t.isActive ? 'border-white/[0.08]' : 'border-white/[0.04]'}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 flex items-center justify-center">
                      <Truck size={18} className="text-brand-cyan" />
                    </div>
                    <span className="font-display font-bold text-white text-sm">{t.registrationNo}</span>
                  </div>
                  <button
                    onClick={() => handleToggle(t.id)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${t.isActive ? 'bg-emerald-500' : 'bg-white/10'}`}
                  >
                    <motion.div
                      animate={{ x: t.isActive ? 20 : 2 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
                    />
                  </button>
                </div>
                <div className="flex items-center gap-4 text-xs text-white/45 mb-2">
                  <span className="flex items-center gap-1"><BarChart3 size={12} /> {t.capacityLiters.toLocaleString()} L</span>
                  {t.tankerTypeName && <span>{t.tankerTypeName}</span>}
                </div>
                {t.notes && <p className="text-xs text-white/30 mb-3">{t.notes}</p>}
                <div className="flex gap-2 pt-2 border-t border-white/[0.06]">
                  <GradientButton variant="ghost" size="sm" onClick={() => openEdit(t)}>
                    <Edit3 size={12} /> Edit
                  </GradientButton>
                  <GradientButton variant="danger" size="sm" onClick={() => setConfirmDelete(t.id)}>
                    <Trash2 size={12} /> Delete
                  </GradientButton>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {confirmDelete !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setConfirmDelete(null)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-ocean border border-white/[0.1] rounded-2xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}>
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={22} className="text-red-400" />
              </div>
              <h3 className="font-display font-bold text-white text-center mb-2">Delete Tanker?</h3>
              <p className="text-sm text-white/40 text-center mb-6">This action cannot be undone.</p>
              <div className="flex gap-3">
                <GradientButton variant="ghost" size="md" onClick={() => setConfirmDelete(null)} className="flex-1">Cancel</GradientButton>
                <GradientButton variant="danger" size="md" onClick={() => confirmAndDelete(confirmDelete)} className="flex-1">Delete</GradientButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editing !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setEditing(null)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-ocean border border-white/[0.1] rounded-2xl p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}>
              <h3 className="font-display font-bold text-white mb-5">{editing === 'new' ? 'Add Tanker' : 'Edit Tanker'}</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-white/40 font-medium mb-1.5 block">Registration Number *</label>
                  <input className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand-cyan/50 transition-colors"
                    placeholder="e.g. TS09AB1234" value={form.registrationNo} onChange={e => setForm(f => ({ ...f, registrationNo: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-white/40 font-medium mb-1.5 block">Capacity (litres) *</label>
                  <input type="number" min="1" className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand-cyan/50 transition-colors"
                    placeholder="e.g. 5000" value={form.capacityLiters} onChange={e => setForm(f => ({ ...f, capacityLiters: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-white/40 font-medium mb-1.5 block">Notes</label>
                  <textarea className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand-cyan/50 transition-colors h-20 resize-y"
                    placeholder="Optional notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                {formErr && <p className="text-xs text-red-400">{formErr}</p>}
                <div className="flex gap-3 pt-2">
                  <GradientButton variant="ghost" size="md" onClick={() => setEditing(null)} className="flex-1">Cancel</GradientButton>
                  <GradientButton variant="primary" size="md" onClick={handleSave} disabled={saving} loading={saving} className="flex-1">
                    {editing === 'new' ? 'Add Tanker' : 'Save'}
                  </GradientButton>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PartnersTab({ showToast }: { showToast: (msg: string) => void }) {
  const [partners, setPartners] = useState<VendorDeliveryPartner[]>([])
  const [unassigned, setUnassigned] = useState<VendorDeliveryPartner[]>([])
  const [settings, setSettings] = useState<DeliverySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [form, setForm] = useState<AddDeliveryPartnerInput>({
    firstName: '', lastName: '', phone: '', email: '', vehicleType: '', vehicleNumber: '', licenseNumber: '', hasLicense: false,
  })
  const [rate5, setRate5] = useState('')
  const [rate7, setRate7] = useState('')
  const [autoAssign, setAutoAssign] = useState(false)

  const load = useCallback(async () => {
    const [pRes, uRes, sRes] = await Promise.all([getVendorDeliveryPartners(), getUnassignedDeliveryPartners(), getVendorDeliverySettings()])
    if (pRes.success) setPartners(pRes.data)
    if (uRes.success) setUnassigned(uRes.data)
    if (sRes.success) {
      setSettings(sRes.data)
      setRate5(String(sRes.data.fee5km ?? sRes.data.earningsPerDelivery))
      setRate7(String(sRes.data.fee7km ?? sRes.data.earningsPerDelivery))
      setAutoAssign(sRes.data.autoAssign)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleAdd() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim()) { setFormErr('Name and phone are required'); return }
    setSaving(true); setFormErr('')
    const res = await addVendorDeliveryPartner(form)
    setSaving(false)
    if (res.success) {
      setShowAdd(false)
      setForm({ firstName: '', lastName: '', phone: '', email: '', vehicleType: '', vehicleNumber: '', licenseNumber: '', hasLicense: false })
      await load()
      showToast('Delivery partner added.')
    } else { setFormErr(res.error) }
  }

  async function handleStatus(id: string, status: string) {
    const res = await updateVendorDeliveryPartnerStatus(id, status)
    if (res.success) { await load(); showToast('Status updated.') } else showToast(res.error)
  }

  async function handleClaim(id: string) {
    const res = await claimDeliveryPartner(id)
    if (res.success) { await load(); showToast('Partner approved.') } else showToast(res.error)
  }

  async function handleRemove(id: string) {
    const res = await removeVendorDeliveryPartner(id)
    if (res.success) { await load(); showToast('Partner removed.') } else showToast(res.error)
  }

  async function handleSaveSettings() {
    const amt5 = parseFloat(rate5)
    const amt7 = parseFloat(rate7)
    if (!amt5 || amt5 <= 0 || !amt7 || amt7 <= 0) { showToast('Enter valid rates for both tiers'); return }
    const res = await updateVendorDeliverySettings({ earningsPerDelivery: amt5, fee5km: amt5, fee7km: amt7, autoAssign })
    if (res.success) {
      setSettings(res.data)
      setRate5(String(res.data.fee5km ?? res.data.earningsPerDelivery))
      setRate7(String(res.data.fee7km ?? res.data.earningsPerDelivery))
      setAutoAssign(res.data.autoAssign)
      showToast('Settings saved.')
    } else { showToast(res.error) }
  }

  if (loading) return <SkeletonLoader count={3} variant="card" />

  return (
    <div className="space-y-6">
      <div className="bg-white/[0.06] border border-white/[0.08] rounded-2xl p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <Settings size={18} className="text-brand-cyan" />
          <h3 className="font-display font-semibold text-white text-sm">Delivery Settings</h3>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-white/40 font-medium mb-1.5 block">Delivery fee — up to 5 km (₹)</label>
            <input type="number" min="1" className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-cyan/50 transition-colors"
              value={rate5} onChange={e => setRate5(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-white/40 font-medium mb-1.5 block">Delivery fee — over 5 km (₹)</label>
            <input type="number" min="1" className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-cyan/50 transition-colors"
              value={rate7} onChange={e => setRate7(e.target.value)} />
          </div>
          <label className="flex items-center gap-2.5 text-sm text-white/60 cursor-pointer pb-2.5">
            <input type="checkbox" checked={autoAssign} onChange={e => setAutoAssign(e.target.checked)}
              className="w-4 h-4 rounded bg-white/[0.06] border-white/[0.15] accent-brand-cyan" />
            Auto-assign to nearest partner
          </label>
          <GradientButton variant="primary" size="sm" onClick={handleSaveSettings}>Save</GradientButton>
        </div>
        <p className="text-[11px] text-white/30 mt-2">Fee is charged to the customer and earned by the partner based on the route distance of each delivery.</p>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-white text-lg">Delivery Partners</h2>
        <GradientButton variant="primary" size="sm" onClick={() => { setFormErr(''); setShowAdd(true) }}>
          <UserPlus size={14} /> Add Partner
        </GradientButton>
      </div>

      {unassigned.length > 0 && (
        <div className="bg-amber-500/[0.05] border border-amber-500/20 rounded-2xl p-5">
          <h3 className="font-display font-semibold text-amber-400 text-sm mb-3">New Signups ({unassigned.length})</h3>
          <div className="space-y-3">
            {unassigned.map(p => (
              <motion.div key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-white">{p.firstName} {p.lastName}</span>
                  <span className="text-[10px] font-bold uppercase text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">new</span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-white/45 mb-3">
                  {p.phone && <span className="flex items-center gap-1"><Phone size={11} /> {p.phone}</span>}
                  {p.email && <span className="flex items-center gap-1"><Mail size={11} /> {p.email}</span>}
                  {p.vehicleType && <span>{p.vehicleType}{p.vehicleNumber ? ` (${p.vehicleNumber})` : ''}</span>}
                  {p.cityName && <span className="flex items-center gap-1"><MapPin size={11} /> {p.cityName}</span>}
                </div>
                <GradientButton variant="primary" size="sm" onClick={() => handleClaim(p.id)}>
                  <ShieldCheck size={12} /> Approve & Add
                </GradientButton>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {partners.length === 0 ? (
        <EmptyState icon={Users} title="No delivery partners" description="Add a partner to start assigning deliveries." action={{ label: 'Add Partner', onClick: () => { setFormErr(''); setShowAdd(true) } }} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {partners.map(p => (
            <motion.div key={p.id} layout
              className={`bg-white/[0.06] border border-white/[0.08] rounded-2xl p-5 ${p.status !== 'active' ? 'opacity-55' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-brand-blue/15 flex items-center justify-center">
                    <Users size={16} className="text-brand-blue" />
                  </div>
                  <span className="font-display font-semibold text-white text-sm">{p.firstName} {p.lastName}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {p.isOnline && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    p.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' :
                    p.status === 'pending' ? 'bg-amber-500/10 text-amber-400' :
                    'bg-white/10 text-white/40'
                  }`}>{p.status}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-white/45 mb-3">
                <span className="flex items-center gap-1"><Phone size={11} /> {p.phone}</span>
                {p.vehicleType && <span>{p.vehicleType}{p.vehicleNumber ? ` (${p.vehicleNumber})` : ''}</span>}
                <span>{p.totalDeliveries} deliveries</span>
                {p.isAvailable ? <span className="text-emerald-400">Available</span> : <span className="text-white/25">Busy</span>}
                {p.activeOrderNumber && <span className="text-brand-cyan">On #{p.activeOrderNumber}</span>}
              </div>
              {(p.latitude != null && p.longitude != null) && (
                <div className="flex flex-wrap items-center gap-3 text-xs mb-3">
                  <a href={openInMaps({ latitude: p.latitude, longitude: p.longitude })} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-medium">
                    <Navigation size={12} /> View on Map
                  </a>
                  {p.lastLocationAt && (
                    <span className="text-white/35">Last seen {formatDate(p.lastLocationAt)}</span>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-white/[0.06]">
                {p.status === 'pending' && (
                  <GradientButton variant="primary" size="sm" onClick={() => handleStatus(p.id, 'active')}>
                    <Play size={12} /> Activate
                  </GradientButton>
                )}
                {p.status === 'active' && (
                  <GradientButton variant="ghost" size="sm" onClick={() => handleStatus(p.id, 'suspended')}>
                    <Pause size={12} /> Suspend
                  </GradientButton>
                )}
                {p.status === 'suspended' && (
                  <GradientButton variant="primary" size="sm" onClick={() => handleStatus(p.id, 'active')}>
                    <Play size={12} /> Reactivate
                  </GradientButton>
                )}
                <GradientButton variant="danger" size="sm" onClick={() => handleRemove(p.id)}>
                  <Trash2 size={12} /> Remove
                </GradientButton>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowAdd(false)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-ocean border border-white/[0.1] rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}>
              <h3 className="font-display font-bold text-white mb-5">Add Delivery Partner</h3>
              <div className="space-y-4">
                {[
                  { key: 'firstName', label: 'First Name *', type: 'text', placeholder: '' },
                  { key: 'lastName', label: 'Last Name *', type: 'text', placeholder: '' },
                  { key: 'phone', label: 'Phone *', type: 'text', placeholder: '' },
                  { key: 'email', label: 'Email', type: 'text', placeholder: '', optional: true },
                  { key: 'vehicleType', label: 'Vehicle Type', type: 'text', placeholder: 'e.g. Auto, Truck', optional: true },
                  { key: 'vehicleNumber', label: 'Vehicle Number', type: 'text', placeholder: '', optional: true },
                  { key: 'licenseNumber', label: 'License Number', type: 'text', placeholder: '', optional: true },
                ].map(field => (
                  <div key={field.key}>
                    <label className="text-xs text-white/40 font-medium mb-1.5 block">{field.label}</label>
                    <input
                      type={field.type}
                      placeholder={field.placeholder}
                      className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand-cyan/50 transition-colors"
                      value={String(form[field.key as keyof AddDeliveryPartnerInput] ?? '')}
                      onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                    />
                  </div>
                ))}
                {formErr && <p className="text-xs text-red-400">{formErr}</p>}
                <div className="flex gap-3 pt-2">
                  <GradientButton variant="ghost" size="md" onClick={() => setShowAdd(false)} className="flex-1">Cancel</GradientButton>
                  <GradientButton variant="primary" size="md" onClick={handleAdd} disabled={saving} loading={saving} className="flex-1">Add Partner</GradientButton>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function VendorOrdersPage() {
  const { navigate } = useNav()
  const [activeNav, setActiveNav] = useState('overview')
  const [available, setAvailable] = useState<VendorOrder[]>([])
  const [mine, setMine] = useState<VendorOrder[]>([])
  const [earnings, setEarnings] = useState<VendorEarnings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [liveLocations, setLiveLocations] = useState<Record<string, { latitude: number; longitude: number; updatedAt: string }>>({})

  const showToast = useCallback((msg: string) => { setToast(msg) }, [])

  const handleLogout = useCallback(() => {
    localStorage.removeItem('wm_token')
    localStorage.removeItem('wm_session')
    window.dispatchEvent(new CustomEvent('wm:logout'))
    navigate('home')
  }, [navigate])

  const load = useCallback(async () => {
    const [ordRes, earnRes] = await Promise.all([getVendorOrders(), getVendorEarnings()])
    if (ordRes.success) { setAvailable(ordRes.data.available); setMine(ordRes.data.mine) }
    else setError(ordRes.error)
    if (earnRes.success) setEarnings(earnRes.data)
    setLoading(false)
  }, [])

  async function handleToggleMode() {
    if (!earnings) return
    const newMode = !earnings.isOnline
    setEarnings(e => e ? { ...e, isOnline: newMode } : e)
    const res = await setVendorWorkMode(newMode)
    if (!res.success) setEarnings(e => e ? { ...e, isOnline: !newMode } : e)
  }

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const socket = connectSocket()
    socket.on('new-order', load)
    socket.on('connect', load)
    socket.on('delivery-location', (payload?: { orderId?: string; latitude?: number; longitude?: number; updatedAt?: string }) => {
      if (payload?.orderId && typeof payload.latitude === 'number' && typeof payload.longitude === 'number') {
        const loc = { latitude: payload.latitude, longitude: payload.longitude, updatedAt: payload.updatedAt ?? '' }
        setLiveLocations(prev => ({ ...prev, [payload.orderId as string]: loc }))
      }
    })
    const poll = setInterval(load, 15000)
    return () => { socket.off('new-order', load); socket.off('connect', load); socket.off('delivery-location'); clearInterval(poll) }
  }, [load])

  async function handleAccept(id: string) {
    setBusy(true)
    const res = await acceptOrder(id)
    setBusy(false)
    if (res.success) {
      setAvailable(prev => prev.filter(o => o.id !== id))
      setMine(prev => [res.data, ...prev])
      setActiveNav('my-orders')
      showToast('Order accepted!')
    } else { showToast(res.error) }
  }

  async function handleReject(id: string) {
    setBusy(true)
    const res = await rejectOrder(id)
    setBusy(false)
    if (res.success) {
      setAvailable(prev => prev.filter(o => o.id !== id))
      setMine(prev => prev.filter(o => o.id !== id))
      showToast('Order rejected.')
    } else { showToast(res.error) }
  }

  async function handleStatus(id: string, status: string) {
    setBusy(true)
    const res = await updateOrderStatus(id, status)
    setBusy(false)
    if (res.success) {
      setMine(prev => prev.map(o => o.id === id ? { ...res.data, customerName: o.customerName } : o))
      showToast('Status updated.')
    } else { showToast(res.error) }
  }

  async function handleAssign(id: string, partnerId: string): Promise<boolean> {
    setBusy(true)
    const res = await assignDeliveryPartner(id, partnerId)
    setBusy(false)
    if (res.success) { await load(); showToast('Assigned.'); return true }
    showToast(res.error); return false
  }

  async function handleAutoAssign(id: string): Promise<boolean> {
    setBusy(true)
    const res = await autoAssignDeliveryPartner(id)
    setBusy(false)
    if (res.success) { await load(); showToast('Auto-assigned.'); return true }
    showToast(res.error); return false
  }

  const activeOrderCount = mine.filter(o => !['delivered', 'rejected', 'cancelled', 'failed'].includes(o.status)).length

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'available', label: 'Available Orders', icon: Inbox, badge: available.length },
    { id: 'my-orders', label: 'My Orders', icon: Package, badge: activeOrderCount },
    { id: 'earnings', label: 'Earnings', icon: Wallet },
    { id: 'fleet', label: 'Fleet', icon: Truck },
    { id: 'partners', label: 'Partners', icon: Users },
  ]

  const PAGE_TITLES: Record<string, string> = {
    overview: 'Overview', available: 'Available Orders', 'my-orders': 'My Orders',
    earnings: 'Earnings', fleet: 'My Fleet', partners: 'Delivery Partners',
  }

  return (
    <>
      <AnimatePresence>
        {toast && <Toast message={toast} onClose={() => setToast('')} />}
      </AnimatePresence>
      <DashboardLayout
        navItems={navItems}
        activeItem={activeNav}
        onNavigate={setActiveNav}
        title="Vendor Dashboard"
        onLogout={handleLogout}
      >
        <motion.div
          key={activeNav}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="font-display font-bold text-white text-xl mb-6">{PAGE_TITLES[activeNav]}</h1>

          {loading ? (
            <SkeletonLoader variant={activeNav === 'overview' ? 'stat' : 'list'} />
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center">
              <p className="text-red-400 text-sm">{error}</p>
              <GradientButton variant="ghost" size="sm" onClick={() => { setError(''); setLoading(true); void load() }} className="mt-3">
                <RefreshCw size={14} /> Retry
              </GradientButton>
            </div>
          ) : (
            <>
              {activeNav === 'overview' && (
                <OverviewTab available={available} mine={mine} earnings={earnings} onToggleMode={handleToggleMode} />
              )}

              {activeNav === 'available' && (
                available.length === 0 ? (
                  <EmptyState icon={Inbox} title="No available orders" description="Check back later for new orders in your area." />
                ) : (
                  <div className="space-y-4">
                    <AnimatePresence mode="popLayout">
                      {available.map(order => (
                        <OrderCard key={order.id} order={order} mode="available"
                          onAccept={handleAccept} onReject={handleReject} onStatus={handleStatus}
                          busy={busy} onAssign={handleAssign} onAutoAssign={handleAutoAssign} showToast={showToast} />
                      ))}
                    </AnimatePresence>
                  </div>
                )
              )}

              {activeNav === 'my-orders' && (
                mine.length === 0 ? (
                  <EmptyState icon={Package} title="No orders yet" description="Accept available orders to see them here." />
                ) : (
                  <div className="space-y-4">
                    <AnimatePresence mode="popLayout">
                      {mine.map(order => (
                        <OrderCard key={order.id} order={order} mode="mine"
                          onAccept={handleAccept} onReject={handleReject} onStatus={handleStatus}
                          busy={busy} onAssign={handleAssign} onAutoAssign={handleAutoAssign} showToast={showToast}
                          liveLocation={liveLocations[order.id]} />
                      ))}
                    </AnimatePresence>
                  </div>
                )
              )}

              {activeNav === 'earnings' && earnings && <EarningsTab earnings={earnings} />}
              {activeNav === 'earnings' && !earnings && (
                <EmptyState icon={Wallet} title="No earnings data" description="Start accepting orders to see your earnings." />
              )}

              {activeNav === 'fleet' && <FleetTab />}
              {activeNav === 'partners' && <PartnersTab showToast={showToast} />}
            </>
          )}
        </motion.div>
      </DashboardLayout>
    </>
  )
}
