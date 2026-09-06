import { useState, useEffect } from 'react'
import { useNav } from '../../context/NavigationContext'
import Header from '../../components/Header/Header'
import { getOrder, rateOrder, cancelOrder } from '../../utils/api'
import { connectSocket } from '../../utils/socket'
import { routeEmbed, pointEmbed, openInMaps, directions, formatDistanceKm } from '../../utils/maps'
import type { Order, OrderStatus } from '../../types'
import './TrackingPage.css'

const API_BASE = (import.meta.env.SITE_API_URL as string | undefined) ?? 'http://localhost:3000'

const VENDOR_HELPLINE = '9490077494'

function tankerImgSrc(url: string | null): string | null {
  if (!url) return null
  return url.startsWith('http') ? url : `${API_BASE}${url}`
}

// ── Timeline config ───────────────────────────────────────────────────────────

interface TimelineStep {
  status:  OrderStatus
  label:   string
  subtext: string
  icon:    string
  tsKey:   keyof Pick<Order, 'createdAt' | 'acceptedAt' | 'preparingAt' | 'inTransitAt' | 'deliveredAt'>
}

const STEPS: TimelineStep[] = [
  { status: 'confirmed',        label: 'Order Placed',       subtext: 'Waiting for a vendor to accept', icon: '📋', tsKey: 'createdAt'   },
  { status: 'accepted',         label: 'Vendor Accepted',    subtext: 'Vendor is ready to deliver',     icon: '✅', tsKey: 'acceptedAt'  },
  { status: 'preparing',        label: 'Preparing Delivery', subtext: 'Loading the truck',              icon: '🚰', tsKey: 'preparingAt' },
  { status: 'out_for_delivery', label: 'Out for Delivery',   subtext: 'On the way to your address',     icon: '🚚', tsKey: 'inTransitAt' },
  { status: 'delivered',        label: 'Delivered',          subtext: 'Order completed',                icon: '🎉', tsKey: 'deliveredAt' },
]

// Each backend status maps to the furthest customer-visible milestone reached.
// The vendor runs: confirmed → accepted → preparing → ready_for_pickup, then a
// delivery partner drives: assigned → … → out_for_delivery → … → delivered.
const STATUS_TO_STEP: Record<string, number> = {
  confirmed:          0,
  accepted:           1,
  preparing:          2,
  ready_for_pickup:   3,
  assigned:           3,
  delivery_accepted:  3,
  arrived_at_pickup:  3,
  picked_up:          3,
  out_for_delivery:   3,
  arrived_at_customer:3,
  in_transit:         3,
  delivered:          4,
}

function stepIndex(status: OrderStatus): number {
  return STATUS_TO_STEP[status] ?? -1
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

interface OrderUpdatePayload {
  orderId: string
  status:  OrderStatus
}

interface DeliveryOtpPayload {
  orderId: string
  devOtp?: string
}

interface DeliveryLocationPayload {
  orderId:   string
  latitude:  number
  longitude: number
  updatedAt?: string
}

// ── Main page ─────────────────────────────────────────────────────────────────

function StarRating({ orderId }: { orderId: string }) {
  const [hovered,  setHovered]  = useState(0)
  const [selected, setSelected] = useState(0)
  const [review,   setReview]   = useState('')
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [err,      setErr]      = useState('')

  async function submit() {
    if (!selected) return
    setSaving(true)
    const res = await rateOrder(orderId, selected, review || undefined)
    setSaving(false)
    if (res.success) setSaved(true)
    else setErr('Could not submit rating. Please try again.')
  }

  if (saved) return (
    <div className="tracking-rating tracking-rating--done">
      <span>⭐</span> Thank you for your rating!
    </div>
  )

  return (
    <div className="tracking-rating">
      <div className="tracking-rating__title">Rate your experience</div>
      <div className="tracking-rating__stars">
        {[1,2,3,4,5].map(n => (
          <button
            key={n}
            className={`tracking-star${n <= (hovered || selected) ? ' tracking-star--on' : ''}`}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => setSelected(n)}
            aria-label={`${n} star`}
          >★</button>
        ))}
      </div>
      {selected > 0 && (
        <textarea
          className="tracking-rating__review"
          placeholder="Leave a comment (optional)"
          value={review}
          onChange={e => setReview(e.target.value)}
          rows={3}
        />
      )}
      {err && <div className="tracking-rating__err">{err}</div>}
      <button
        className="tracking-btn-primary"
        style={{ marginTop: 12 }}
        onClick={submit}
        disabled={!selected || saving}
      >
        {saving ? 'Submitting…' : 'Submit Rating'}
      </button>
    </div>
  )
}

export default function TrackingPage() {
  const { navigate } = useNav()

  const orderId = new URLSearchParams(window.location.search).get('orderId') ??
                  new URLSearchParams(window.location.search).get('id')

  const [order,      setOrder]      = useState<Order | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelErr,  setCancelErr]  = useState('')
  const [deliveryOtp, setDeliveryOtp] = useState('')
  const [partnerPos, setPartnerPos] = useState<{ latitude: number; longitude: number } | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  useEffect(() => {
    if (!orderId) { setError('No order ID provided.'); setLoading(false); return }
    getOrder(orderId).then(res => {
      if (res.success) setOrder(res.data)
      else setError('Order not found.')
      setLoading(false)
    })
  }, [orderId])

  useEffect(() => {
    if (!orderId) return
    const socket = connectSocket()
    function onOrderUpdated(payload: OrderUpdatePayload) {
      if (payload.orderId !== orderId) return
      // Optimistically update the status immediately for a snappy live feel…
      setOrder(prev => prev ? { ...prev, status: payload.status } : prev)
      // …then refetch the full order so every timestamp stays accurate.
      getOrder(orderId).then(res => {
        if (res.success) setOrder(res.data)
      })
    }
    socket.on('order-updated', onOrderUpdated)
    function onDeliveryOtp(payload: DeliveryOtpPayload) {
      if (payload.orderId !== orderId) return
      if (payload.devOtp) setDeliveryOtp(payload.devOtp)
    }
    socket.on('delivery-otp', onDeliveryOtp)
    function onDeliveryLocation(payload: DeliveryLocationPayload) {
      if (payload.orderId !== orderId) return
      if (typeof payload.latitude === 'number' && typeof payload.longitude === 'number') {
        setPartnerPos({ latitude: payload.latitude, longitude: payload.longitude })
        setLastUpdated(payload.updatedAt ?? new Date().toISOString())
      }
    }
    socket.on('delivery-location', onDeliveryLocation)
    return () => {
      socket.off('order-updated', onOrderUpdated)
      socket.off('delivery-otp', onDeliveryOtp)
      socket.off('delivery-location', onDeliveryLocation)
    }
  }, [orderId])

  async function handleCancel() {
    if (!order) return
    setCancelling(true)
    setCancelErr('')
    const res = await cancelOrder(order.id)
    setCancelling(false)
    if (res.success) setOrder(res.data)
    else setCancelErr(res.error)
  }

  function goBack() { navigate('profile', undefined, 'panel=orders') }

  if (loading) return (
    <><Header />
    <div className="tracking-page">
      <TopBar onBack={goBack} />
      <div className="tracking-center"><div className="tracking-spinner" /><span>Loading order…</span></div>
    </div></>
  )

  if (error || !order) return (
    <><Header />
    <div className="tracking-page">
      <TopBar onBack={goBack} />
      <div className="tracking-center tracking-center--error">{error || 'Order not found.'}</div>
    </div></>
  )

  const currentIdx = stepIndex(order.status)
  const isTerminal = order.status === 'rejected' || order.status === 'cancelled' || order.status === 'failed'

  const addrParts = [
    order.deliveryDoorNo, order.deliveryPlotNo, order.deliveryBuildingName,
    order.deliveryStreetName, order.deliveryAreaName,
  ].filter(Boolean).join(', ')
  const cityState = [order.deliveryCity, order.deliveryState].filter(Boolean).join(', ')
  const fullAddr  = [addrParts, cityState].filter(Boolean).join(', ')

  const livePos =
    partnerPos ??
    (order.deliveryPartnerLatitude != null && order.deliveryPartnerLongitude != null
      ? { latitude: order.deliveryPartnerLatitude, longitude: order.deliveryPartnerLongitude }
      : null)

  return (
    <><Header />
    <div className="tracking-page">
      <TopBar onBack={goBack} />

      <div className="tracking-body">

        {/* ── Order title ─────────────────────────────────────────────────── */}
        <div className="tracking-hero">
          <div className="tracking-hero__num">Order #{order.orderNumber}</div>
          <span className={`tracking-hero__badge tracking-hero__badge--${order.status}`}>
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
          <div className="tracking-hero__date">Placed on {fmtDate(order.createdAt)}</div>
        </div>

        {/* ── Delivery details card ───────────────────────────────────────── */}
        <div className="tracking-card">
          <div className="tracking-card__heading">📍 Delivery Address</div>
          {addrParts && <div className="tracking-card__line">{addrParts}</div>}
          {cityState  && <div className="tracking-card__line tracking-card__line--city">{cityState}</div>}
          {order.deliveryPincode && (
            <div className="tracking-card__line tracking-card__line--city">PIN: {order.deliveryPincode}</div>
          )}
          <div className="tracking-card__divider" />
          <div className="tracking-card__row">
            <span className="tracking-card__key">Delivery time</span>
            <span className="tracking-card__val">
              {order.scheduledAt
                ? `Scheduled · ${fmt(order.scheduledAt)}`
                : '⚡ ASAP'}
            </span>
          </div>
          {order.timeSlab && (
            <div className="tracking-card__row">
              <span className="tracking-card__key">Tanker stay (time slab)</span>
              <span className="tracking-card__val">{order.timeSlab}</span>
            </div>
          )}
          {order.siteType && (
            <div className="tracking-card__row">
              <span className="tracking-card__key">Site type</span>
              <span className="tracking-card__val">
                {order.siteType}{order.siteSubType ? ` · ${order.siteSubType}` : ''}
              </span>
            </div>
          )}
        </div>

        {/* ── Delivery OTP card ─────────────────────────────────────────── */}
        {!isTerminal && order.status !== 'delivered' && (
          <div className="tracking-card">
            <div className="tracking-card__heading">🔑 Delivery Confirmation OTP</div>
            {deliveryOtp ? (
              <>
                <div className="tracking-card__otp">{deliveryOtp}</div>
                <div className="tracking-vendor__area" style={{ marginBottom: 0 }}>
                  Share this OTP with your delivery partner to confirm delivery.
                </div>
              </>
            ) : (
              <div className="tracking-vendor__area" style={{ marginBottom: 0 }}>
                Your delivery confirmation OTP will appear here. Keep it ready — your delivery partner will ask you for it when they deliver your water.
              </div>
            )}
          </div>
        )}

        {/* ── Order details card ─────────────────────────────────────────── */}
        {(order.tankerTypeName || order.totalPrice != null) && (
          <div className="tracking-card">
            <div className="tracking-card__heading">🚛 Order Details</div>
            {/* Tanker image + name + capacity hero */}
            {order.tankerTypeName && (
              <div className="tracking-tanker-hero">
                {tankerImgSrc(order.tankerImageUrl)
                  ? <img
                      className="tracking-tanker-hero__img"
                      src={tankerImgSrc(order.tankerImageUrl)!}
                      alt={order.tankerTypeName}
                    />
                  : <div className="tracking-tanker-hero__placeholder">🚛</div>
                }
                <div className="tracking-tanker-hero__info">
                  <div className="tracking-tanker-hero__name">{order.tankerTypeName}</div>
                  {order.capacityLitres != null && (
                    <div className="tracking-tanker-hero__cap">
                      {order.capacityLitres >= 1000
                        ? `${order.capacityLitres / 1000}K litres`
                        : `${order.capacityLitres} litres`}
                    </div>
                  )}
                </div>
              </div>
            )}
            {order.quantity > 1 && (
              <div className="tracking-card__row">
                <span className="tracking-card__key">Quantity</span>
                <span className="tracking-card__val">×{order.quantity}</span>
              </div>
            )}
            {order.unitPrice != null && order.quantity > 1 && (
              <div className="tracking-card__row">
                <span className="tracking-card__key">Unit price</span>
                <span className="tracking-card__val">₹{order.unitPrice.toLocaleString('en-IN')}</span>
              </div>
            )}
            {order.totalPrice != null && (
              <>
                {order.deliveryFee != null && (
                  <div className="tracking-card__row">
                    <span className="tracking-card__key">
                      Delivery fee{order.deliveryDistanceKm != null ? ` (${formatDistanceKm(order.deliveryDistanceKm)})` : ''}
                    </span>
                    <span className="tracking-card__val">₹{order.deliveryFee.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className="tracking-card__divider" />
                <div className="tracking-card__row">
                  <span className="tracking-card__key tracking-card__key--total">Total amount</span>
                  <span className="tracking-card__val tracking-card__val--total">
                    ₹{order.totalPrice.toLocaleString('en-IN')}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Terminal state ──────────────────────────────────────────────── */}
        {isTerminal ? (
          <div className="tracking-terminal">
            <div className="tracking-terminal__icon">❌</div>
            <div className="tracking-terminal__title">
              Order {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
            </div>
            <div className="tracking-terminal__sub">
              {order.status === 'rejected'
                ? 'A vendor could not fulfil this order. Please place a new order.'
                : 'This order has been cancelled.'}
            </div>
            <button className="tracking-btn-primary" onClick={() => navigate('order')}>
              Place New Order
            </button>
          </div>
        ) : (
          <>
            {/* ── Timeline ─────────────────────────────────────────────────── */}
            <div className="tracking-card">
              <div className="tracking-card__heading">🗓 Order Progress</div>
              <div className="tracking-timeline">
                {STEPS.map((step, i) => {
                  const done    = currentIdx >= 0 && i <= currentIdx
                  const current = i === currentIdx
                  const ts      = order[step.tsKey] as string | null | undefined
                  return (
                    <div key={step.status} className="tracking-step">
                      {/* Left: dot + connector */}
                      <div className="tracking-step__left">
                        <div className={
                          'tracking-step__dot' +
                          (done    ? ' tracking-step__dot--done'    : '') +
                          (current ? ' tracking-step__dot--current' : '')
                        }>
                          {done ? step.icon : <span className="tracking-step__num">{i + 1}</span>}
                        </div>
                        {i < STEPS.length - 1 && (
                          <div className={
                            'tracking-step__line' +
                            (done && i < currentIdx ? ' tracking-step__line--done' : '')
                          } />
                        )}
                      </div>

                      {/* Right: content */}
                      <div className={
                        'tracking-step__content' +
                        (current       ? ' tracking-step__content--current' : '') +
                        (done && !current ? ' tracking-step__content--done' : '') +
                        (!done         ? ' tracking-step__content--pending'  : '')
                      }>
                        <div className="tracking-step__label">{step.label}</div>
                        <div className="tracking-step__sub">
                          {ts ? fmt(ts) : step.subtext}
                        </div>
                        {current && (
                          <div className="tracking-step__pulse-row">
                            <span className="tracking-step__pulse" />
                            <span className="tracking-step__live">Live</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Cancel order ─────────────────────────────────────────────── */}
            {order.status === 'confirmed' && (
              <div className="tracking-card" style={{ textAlign: 'center' }}>
                {cancelErr && (
                  <div className="tracking-rating__err" style={{ marginBottom: 10 }}>{cancelErr}</div>
                )}
                <button
                  className="tracking-btn-danger"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  {cancelling ? 'Cancelling…' : 'Cancel Order'}
                </button>
              </div>
            )}

            {/* ── Vendor card ───────────────────────────────────────────────── */}
            {order.vendorCompany && (
              <div className="tracking-card">
                <div className="tracking-card__heading">🚛 Your Vendor</div>
                <div className="tracking-vendor__name">{order.vendorCompany}</div>
                {(order.vendorArea || order.vendorCity) && (
                  <div className="tracking-vendor__area">
                    {[order.vendorArea, order.vendorCity].filter(Boolean).join(', ')}
                  </div>
                )}
                <a className="tracking-vendor__phone" href={`tel:${VENDOR_HELPLINE}`}>
                  📞 Call vendor — {VENDOR_HELPLINE}
                </a>
              </div>
            )}

            {/* ── Delivery partner card ─────────────────────────────────────── */}
            {order.deliveryPartnerName ? (
              <div className="tracking-card">
                <div className="tracking-card__heading">🚚 Your Delivery Partner</div>
                <div className="tracking-vendor__name">{order.deliveryPartnerName}</div>
                {order.deliveryPartnerPhone && (
                  <a className="tracking-vendor__phone" href={`tel:${order.deliveryPartnerPhone}`}>
                    📞 {order.deliveryPartnerPhone}
                  </a>
                )}
                {order.deliveryPartnerEmail && (
                  <a className="tracking-vendor__mail" href={`mailto:${order.deliveryPartnerEmail}`}>
                    ✉️ {order.deliveryPartnerEmail}
                  </a>
                )}
              </div>
            ) : (
              <div className="tracking-card">
                <div className="tracking-card__heading">🚚 Your Delivery Partner</div>
                <div className="tracking-vendor__area">
                  A delivery partner will be assigned once your order is ready for pickup.
                </div>
              </div>
            )}

            {/* ── Live delivery tracking map ──────────────────────────────── */}
            {order.deliveryPartnerName && order.status !== 'delivered' && (
              <div className="tracking-card">
                <div className="tracking-card__heading">📍 Live Delivery Tracking</div>
                <div className="tracking-vendor__name">Track on the map below</div>
                <div className="tracking-vendor__area">
                  {livePos
                    ? `Partner location ${lastUpdated ? `updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'live'}`
                    : 'Waiting for your delivery partner’s live location…'}
                </div>
                <div className="tracking-map">
                  <iframe
                    src={livePos ? routeEmbed(livePos, fullAddr) : pointEmbed(fullAddr)}
                    title="Delivery partner location map"
                    className="tracking-map__frame"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
                <div className="tracking-map__actions">
                  <a className="tracking-btn-primary tracking-map__btn" href={openInMaps(livePos ?? fullAddr)} target="_blank" rel="noreferrer">
                    🗺 View in Google Maps
                  </a>
                  <a className="tracking-btn-outline tracking-map__btn" href={directions(livePos, fullAddr)} target="_blank" rel="noreferrer">
                    🧭 Directions to my address
                  </a>
                </div>
              </div>
            )}

            {/* ── Delivered success ─────────────────────────────────────────── */}
            {order.status === 'delivered' && (
              <>
                <div className="tracking-card tracking-card--success">
                  <div className="tracking-success__icon">🎉</div>
                  <div className="tracking-success__title">Order Delivered!</div>
                  <div className="tracking-success__sub">Thank you for choosing TankerDrop.</div>
                  <button className="tracking-btn-primary" onClick={() => navigate('order')}>
                    Place Another Order
                  </button>
                </div>
                <div className="tracking-card">
                  <StarRating orderId={order.id} />
                </div>
              </>
            )}
          </>
        )}

      </div>
    </div>
    </>
  )
}

// ── Status label map ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft:               'Draft',
  confirmed:           'Waiting for Vendor',
  accepted:            'Vendor Accepted',
  preparing:           'Preparing',
  ready_for_pickup:    'Ready for Pickup',
  assigned:            'Partner Assigned',
  delivery_accepted:   'Delivery Accepted',
  arrived_at_pickup:   'Arrived at Pickup',
  picked_up:           'Picked Up',
  in_transit:          'Out for Delivery',
  out_for_delivery:    'Out for Delivery',
  arrived_at_customer: 'Arrived at Customer',
  delivered:           'Delivered',
  rejected:            'Rejected',
  cancelled:           'Cancelled',
  failed:              'Failed',
}

// ── Top bar ───────────────────────────────────────────────────────────────────

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <div className="tracking-topbar">
      <button className="tracking-topbar__back" onClick={onBack}>‹</button>
      <span className="tracking-topbar__title">Track Order</span>
    </div>
  )
}
