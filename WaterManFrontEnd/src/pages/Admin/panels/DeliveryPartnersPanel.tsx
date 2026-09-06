import { useState, useEffect } from 'react'
import { getAdminDeliveryPartners, updateAdminDeliveryPartnerStatus } from '../../../utils/api'
import type { AdminDeliveryPartner } from '../../../types'
import '../AdminShared.css'
import './DeliveryPartnersPanel.css'

export default function DeliveryPartnersPanel() {
  const [partners, setPartners] = useState<AdminDeliveryPartner[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [toast, setToast] = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function load(nextStatus = statusFilter) {
    setLoading(true)
    const res = await getAdminDeliveryPartners(1, nextStatus || undefined)
    if (res.success) {
      setPartners(res.data.data)
      setTotal(res.data.total)
    }
    setLoading(false)
  }

  useEffect(() => { void load('') }, [])

  async function handleStatusFilter(s: string) {
    setStatusFilter(s)
    await load(s)
  }

  async function handleStatus(id: string, status: string) {
    const res = await updateAdminDeliveryPartnerStatus(id, status)
    if (res.success) { await load(); showToast('Partner status updated.') }
    else showToast(res.error)
  }

  return (
    <div className="admin-section delivery-admin">
      {toast && <div className="delivery-admin__toast">{toast}</div>}

      <div className="admin-section__header">
        <h3 className="admin-section__title">Delivery Partners</h3>
        <div className="delivery-admin__filters">
          {(['', 'pending', 'active', 'suspended'] as string[]).map(s => (
            <button
              key={s || 'all'}
              className={`delivery-admin__filter${statusFilter === s ? ' delivery-admin__filter--active' : ''}`}
              onClick={() => handleStatusFilter(s)}
            >
              {s === '' ? `All (${total})` : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="delivery-admin__loading">Loading…</div>
      ) : partners.length === 0 ? (
        <div className="delivery-admin__empty">No delivery partners found.</div>
      ) : (
        <div className="delivery-admin__list">
          {partners.map(p => (
            <div key={p.id} className={`delivery-admin__card${p.status !== 'active' ? ' delivery-admin__card--inactive' : ''}`}>
              <div className="delivery-admin__card-top">
                <span className="delivery-admin__name">{p.firstName} {p.lastName}</span>
                <span className={`delivery-admin__status delivery-admin__status--${p.status}`}>{p.status}</span>
              </div>
              <div className="delivery-admin__info">
                <span>📞 {p.phone}</span>
                <span>· {p.isOnline ? '🟢 Online' : '⚪ Offline'}</span>
                <span>· {p.isAvailable ? 'Available' : 'Busy'}</span>
              </div>
              <div className="delivery-admin__info">
                <span>🏢 {p.vendorName}</span>
                {p.vehicleType && <span>· 🚛 {p.vehicleType}</span>}
              </div>
              <div className="delivery-admin__stats">
                <span><strong>{p.totalDeliveries}</strong> deliveries</span>
                {p.activeOrders > 0 && <span><strong>{p.activeOrders}</strong> active</span>}
              </div>
              <div className="delivery-admin__actions">
                {p.status === 'pending' && (
                  <button className="delivery-admin__btn delivery-admin__btn--approve"
                    onClick={() => handleStatus(p.id, 'active')}>Approve</button>
                )}
                {p.status === 'pending' && (
                  <button className="delivery-admin__btn delivery-admin__btn--reject"
                    onClick={() => handleStatus(p.id, 'rejected')}>Reject</button>
                )}
                {p.status === 'active' && (
                  <button className="delivery-admin__btn delivery-admin__btn--suspend"
                    onClick={() => handleStatus(p.id, 'suspended')}>Suspend</button>
                )}
                {p.status === 'suspended' && (
                  <button className="delivery-admin__btn delivery-admin__btn--approve"
                    onClick={() => handleStatus(p.id, 'active')}>Reactivate</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
