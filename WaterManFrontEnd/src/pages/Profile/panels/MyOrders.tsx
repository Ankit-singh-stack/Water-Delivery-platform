import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getOrders, getOrderSummary } from '../../../utils/api'
import { connectSocket } from '../../../utils/socket'
import { useNav } from '../../../context/NavigationContext'
import type { Order, OrderSummary, OrderStatus } from '../../../types'

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft:               'Draft',
  confirmed:           'Confirmed',
  accepted:            'Accepted',
  preparing:           'Preparing',
  ready_for_pickup:    'Ready for Pickup',
  assigned:            'Delivery Partner Assigned',
  delivery_accepted:   'Delivery Accepted',
  arrived_at_pickup:   'Arrived at Pickup',
  picked_up:           'Picked Up',
  in_transit:          'In Transit',
  out_for_delivery:    'Out for Delivery',
  arrived_at_customer: 'Arrived at Customer',
  delivered:           'Delivered',
  failed:              'Failed',
  rejected:            'Rejected',
  cancelled:           'Cancelled',
}

const ACTIVE_STATUSES: OrderStatus[] = ['confirmed', 'accepted', 'preparing', 'ready_for_pickup', 'assigned', 'delivery_accepted', 'arrived_at_pickup', 'picked_up', 'in_transit', 'out_for_delivery', 'arrived_at_customer']

type FilterTab = 'all' | 'active' | 'delivered' | 'cancelled'

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'active',    label: 'Active' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled / Rejected' },
]

const FILTER_MAP: Record<FilterTab, (o: Order) => boolean> = {
  all:       () => true,
  active:    o => ['confirmed','accepted','preparing','ready_for_pickup','assigned','delivery_accepted','arrived_at_pickup','picked_up','in_transit','out_for_delivery','arrived_at_customer'].includes(o.status),
  delivered: o => o.status === 'delivered',
  cancelled: o => ['cancelled','rejected','failed'].includes(o.status),
}

export default function MyOrders() {
  const { t } = useTranslation()
  const { navigate } = useNav()
  const [orders,  setOrders]  = useState<Order[]>([])
  const [summary, setSummary] = useState<OrderSummary>({ active: 0, delivered: 0, failed: 0, rejected: 0, cancelled: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<FilterTab>('all')
  const [search,  setSearch]  = useState('')

  async function load() {
    const [oRes, sRes] = await Promise.all([getOrders(), getOrderSummary()])
    if (oRes.success) setOrders(oRes.data)
    if (sRes.success) setSummary(sRes.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const socket = connectSocket()
    function onOrderUpdated() { load() }
    socket.on('order-updated', onOrderUpdated)
    return () => { socket.off('order-updated', onOrderUpdated) }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders
      .filter(FILTER_MAP[tab])
      .filter(o => !q || o.orderNumber.toLowerCase().includes(q) ||
        o.deliveryCity.toLowerCase().includes(q) ||
        o.deliveryAreaName.toLowerCase().includes(q))
  }, [orders, tab, search])

  function formatAddress(o: Order): string {
    return [o.deliveryDoorNo, o.deliveryPlotNo, o.deliveryBuildingName,
            o.deliveryStreetName, o.deliveryAreaName, o.deliveryCity, o.deliveryState]
      .filter(Boolean).join(', ')
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  }

  if (loading) return (
    <div className="panel-card"><div className="panel-loading"><div className="spinner" /></div></div>
  )

  return (
    <div className="panel-card">
      <h2 className="panel__title">{t('profile.orders.title')}</h2>
      <p className="panel__subtitle">{t('profile.orders.subtitle')}</p>

      {/* Stats dashboard */}
      <div className="orders-stats">
        <div className="stat-card stat-card--draft">
          <div className="stat-card__count">{summary.active}</div>
          <div className="stat-card__label">{t('profile.orders.stat_draft')}</div>
        </div>
        <div className="stat-card stat-card--delivered">
          <div className="stat-card__count">{summary.delivered}</div>
          <div className="stat-card__label">{t('profile.orders.stat_delivered')}</div>
        </div>
        <div className="stat-card stat-card--failed">
          <div className="stat-card__count">{summary.failed}</div>
          <div className="stat-card__label">{t('profile.orders.stat_failed')}</div>
        </div>
        <div className="stat-card stat-card--rejected">
          <div className="stat-card__count">{summary.rejected}</div>
          <div className="stat-card__label">{t('profile.orders.stat_rejected')}</div>
        </div>
      </div>

      {/* Search + Filter tabs */}
      <div className="orders-toolbar">
        <div className="orders-search-wrap">
          <svg className="orders-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            className="orders-search"
            placeholder="Search by order ID, city, area…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="orders-search-clear" onClick={() => setSearch('')}>×</button>
          )}
        </div>

        <div className="orders-tabs">
          {FILTER_TABS.map(ft => (
            <button
              key={ft.key}
              className={`orders-tab${tab === ft.key ? ' orders-tab--active' : ''}`}
              onClick={() => setTab(ft.key)}
            >
              {ft.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
          </svg>
          <p>{search ? `No orders matching "${search}"` : t('profile.orders.empty')}</p>
        </div>
      ) : (
        <div className="orders-table-wrap">
          <table className="orders-table">
            <thead>
              <tr>
                <th>{t('profile.orders.col_srno')}</th>
                <th>{t('profile.orders.col_order_id')}</th>
                <th>Tanker</th>
                <th>{t('profile.orders.col_address')}</th>
                <th>{t('profile.orders.col_date')}</th>
                <th>Amount</th>
                <th>{t('profile.orders.col_status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order, idx) => (
                <tr key={order.id}>
                  <td style={{ color: 'rgba(255,255,255,0.4)' }}>{idx + 1}</td>
                  <td><span className="order-id">#{order.orderNumber}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {order.tankerTypeName ? (
                      <span className="order-tanker-info">
                        <span className="order-tanker-info__name">{order.tankerTypeName}</span>
                        {order.capacityLitres && (
                          <span className="order-tanker-info__cap">
                            {order.capacityLitres >= 1000
                              ? `${order.capacityLitres / 1000}K L`
                              : `${order.capacityLitres} L`}
                          </span>
                        )}
                        {order.quantity > 1 && (
                          <span className="order-tanker-info__qty">×{order.quantity}</span>
                        )}
                      </span>
                    ) : <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>}
                  </td>
                  <td style={{ maxWidth: 200 }}>{formatAddress(order)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(order.createdAt)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {order.totalPrice != null
                      ? <span className="order-amount">₹{order.totalPrice.toLocaleString('en-IN')}</span>
                      : <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>}
                  </td>
                  <td>
                    <span className={`status-badge status-badge--${order.status}`}>
                      {STATUS_LABELS[order.status]}
                    </span>
                  </td>
                  <td>
                    {ACTIVE_STATUSES.includes(order.status) && (
                      <button
                        className="track-btn"
                        onClick={() => navigate('tracking', undefined, `orderId=${order.id}`)}
                      >
                        Track
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
