import { useState, useEffect, useMemo } from 'react'
import { useNav } from '../../context/NavigationContext'
import Header from '../../components/Header/Header'
import { getAddresses, placeOrder, getPublicCities, getPublicTankerTypes, initiatePayment, verifyPayment, markOrderCod } from '../../utils/api'
import type { Address, PublicCity, TankerType } from '../../types'
import './OrderPage.css'

const API_BASE = (import.meta.env.SITE_API_URL as string | undefined) ?? 'http://localhost:3000'
function tankerImgSrc(url: string | null | undefined) {
  if (!url) return null
  return url.startsWith('http') ? url : `${API_BASE}${url}`
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void }
  }
}

interface DeliveryAddress {
  doorNo?:       string
  plotNo?:       string
  buildingName?: string
  streetName:    string
  areaName:      string
  city:          string
  state:         string
  pincode:       string
}

const SITE_TYPES = [
  { key: 'Residential',   icon: '🏠' },
  { key: 'Commercial',    icon: '🏢' },
  { key: 'Construction',  icon: '🏗️' },
]

const SITE_SUB_TYPES: Record<string, string[]> = {
  Commercial:   ['School', 'Hospital'],
  Construction: ['Layout', 'Building', 'Roads'],
}

const TIME_SLABS = [
  { key: '6 hours',  icon: '⏱️', sub: 'Tanker stays for 6 hours'  },
  { key: '12 hours', icon: '🕛', sub: 'Tanker stays for 12 hours' },
  { key: '2 days',   icon: '📆', sub: 'Tanker stays for 2 days'   },
]

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

type NewAddrErrors = Partial<Record<'streetName' | 'areaName' | 'cityId' | 'pincode', string>>

const STEP_LABELS = ['Tanker', 'Address', 'Time', 'Review']

export default function OrderPage() {
  const { navigate } = useNav()

  const [step,           setStep]           = useState(1)
  const [tankerTypes,    setTankerTypes]    = useState<TankerType[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  const [quantity,       setQuantity]       = useState(1)
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([])
  const [cities,         setCities]         = useState<PublicCity[]>([])
  const [loadingInit,    setLoadingInit]    = useState(true)
  const [orderNum,       setOrderNum]       = useState('')
  const [orderOtp,       setOrderOtp]       = useState('')
  const [done,           setDone]           = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNew,    setShowNew]    = useState(false)
  const [newAddr,    setNewAddr]    = useState({ doorNo: '', plotNo: '', buildingName: '', streetName: '', areaName: '', cityId: '', state: '' })
  const [pincode,    setPincode]    = useState('')
  const [addrErrors, setAddrErrors] = useState<NewAddrErrors>({})

  const [deliveryType, setDeliveryType] = useState<'asap' | 'scheduled'>('asap')
  const [scheduledAt,  setScheduledAt]  = useState('')
  const [siteType,     setSiteType]     = useState('')
  const [siteSubType,  setSiteSubType]  = useState('')
  const [timeSlab,     setTimeSlab]     = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'online'>('cod')
  const [placing,      setPlacing]      = useState(false)
  const [error,        setError]        = useState('')

  const minDateTime = new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 16)

  useEffect(() => {
    Promise.all([getAddresses(), getPublicCities(), getPublicTankerTypes()]).then(([ar, cr, tr]) => {
      if (ar.success) {
        setSavedAddresses(ar.data)
        if (ar.data.length > 0) {
          setSelectedId(ar.data[0].id)
          setPincode(ar.data[0].pincode ?? '')
        }
        else setShowNew(true)
      }
      if (cr.success) setCities(cr.data)
      if (tr.success) {
        setTankerTypes(tr.data)
        if (tr.data.length > 0) setSelectedTypeId(tr.data[0].id)
      }
      setLoadingInit(false)
    })
  }, [])

  const cityGroups = useMemo(() => {
    const map = new Map<string, PublicCity[]>()
    for (const c of cities) {
      if (!map.has(c.stateName)) map.set(c.stateName, [])
      map.get(c.stateName)!.push(c)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [cities])

  function handleCityChange(id: string) {
    const found = cities.find(c => c.id === id)
    setNewAddr(f => ({ ...f, cityId: id, state: found?.stateName ?? '' }))
    setAddrErrors(e => ({ ...e, cityId: '' }))
  }

  function resolveAddress(): DeliveryAddress | null {
    const e: NewAddrErrors = {}
    if (!pincode.trim())            e.pincode = 'Required'
    else if (!/^\d{6}$/.test(pincode.trim())) e.pincode = 'Enter a valid 6-digit pincode'
    if (Object.keys(e).length) { setAddrErrors(prev => ({ ...prev, ...e })); return null }

    if (showNew || selectedId === null) {
      if (!newAddr.streetName.trim()) e.streetName = 'Required'
      if (!newAddr.areaName.trim())   e.areaName   = 'Required'
      if (!newAddr.cityId)            e.cityId     = 'Please select a city'
      if (Object.keys(e).length) { setAddrErrors(e); return null }
      const city = cities.find(c => c.id === newAddr.cityId)
      return { ...newAddr, city: city?.name ?? '', state: city?.stateName ?? '', pincode: pincode.trim() }
    }
    const a = savedAddresses.find(a => a.id === selectedId)!
    return {
      doorNo: a.doorNo ?? undefined, plotNo: a.plotNo ?? undefined,
      buildingName: a.buildingName ?? undefined,
      streetName: a.streetName, areaName: a.areaName,
      city: a.city, state: a.state, pincode: pincode.trim(),
    }
  }

  function goToStep2() {
    if (!selectedTypeId) { setError('Please select a tanker type'); return }
    setError('')
    setStep(2)
  }

  function goToStep3() {
    const address = resolveAddress()
    if (!address) return
    setError('')
    setStep(3)
  }

  function goToStep4() {
    if (deliveryType === 'scheduled' && !scheduledAt) {
      setError('Please select a delivery date and time.')
      return
    }
    if (!siteType) {
      setError('Please select a site type.')
      return
    }
    if (siteType !== 'Residential' && !siteSubType) {
      setError(`Please select a ${siteType.toLowerCase()} site type.`)
      return
    }
    if (!timeSlab) {
      setError('Please select how long the tanker should stay.')
      return
    }
    setError('')
    setStep(4)
  }

  async function handlePlace() {
    const address = resolveAddress()
    if (!address) return
    if (!selectedTypeId) return
    setPlacing(true)
    setError('')
    const res = await placeOrder({
      tankerTypeId:         selectedTypeId,
      quantity,
      deliveryDoorNo:       address.doorNo,
      deliveryPlotNo:       address.plotNo,
      deliveryBuildingName: address.buildingName,
      deliveryStreetName:   address.streetName,
      deliveryAreaName:     address.areaName,
      deliveryCity:         address.city,
      deliveryState:        address.state,
      deliveryPincode:      address.pincode,
      siteType:             siteType || undefined,
      siteSubType:          siteType !== 'Residential' ? (siteSubType || undefined) : undefined,
      timeSlab:             timeSlab || undefined,
      scheduledAt:          deliveryType === 'scheduled' ? scheduledAt : undefined,
    })
    if (!res.success) { setPlacing(false); setError('Failed to place order. Please try again.'); return }

    const orderId = res.data.id

    if (paymentMethod === 'cod') {
      await markOrderCod(orderId)
      setPlacing(false)
      setOrderNum(res.data.orderNumber)
      setOrderOtp(res.data.devOtp ?? '')
      setDone(true)
      return
    }

    // Razorpay online payment
    const payRes = await initiatePayment(orderId)
    setPlacing(false)
    if (!payRes.success) {
      setError(payRes.error === 'payment_not_configured' ? 'Online payment is not available right now. Please use Cash on Delivery.' : 'Failed to initiate payment.')
      return
    }

    const { razorpayOrderId, amount, currency, keyId } = payRes.data

    const loadScript = () => new Promise<void>((resolve, reject) => {
      if (window.Razorpay) { resolve(); return }
      const s = document.createElement('script')
      s.src = 'https://checkout.razorpay.com/v1/checkout.js'
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('razorpay_load_failed'))
      document.body.appendChild(s)
    })

    try {
      await loadScript()
    } catch {
      setError('Failed to load payment gateway. Please try again.')
      return
    }

    const finalOrderNum = res.data.orderNumber
    new window.Razorpay({
      key:         keyId,
      order_id:    razorpayOrderId,
      amount,
      currency,
      name:        'TankerDrop',
      description: `Order ${finalOrderNum}`,
      handler:     async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        const vRes = await verifyPayment(orderId, {
          razorpayPaymentId: response.razorpay_payment_id,
          razorpayOrderId:   response.razorpay_order_id,
          razorpaySignature: response.razorpay_signature,
        })
        if (vRes.success) {
          setOrderNum(finalOrderNum)
          setOrderOtp(res.data.devOtp ?? '')
          setDone(true)
        } else {
          setError('Payment verification failed. Please contact support.')
        }
      },
      modal: {
        ondismiss: () => {
          setError('Payment cancelled. You can try again or use Cash on Delivery.')
        },
      },
      theme: { color: '#00BCD4' },
    }).open()
  }

  function formatAddr(a: Address) {
    return [a.doorNo, a.plotNo, a.buildingName, a.streetName, a.areaName, a.city, a.state]
      .filter(Boolean).join(', ')
  }

  const deliveryCity = (() => {
    if (showNew || selectedId === null) {
      return cities.find(c => c.id === newAddr.cityId)?.name ?? ''
    }
    return savedAddresses.find(a => a.id === selectedId)?.city ?? ''
  })()

  const selectedType = tankerTypes.find(t => t.id === selectedTypeId)
  const totalPrice   = selectedType ? selectedType.basePrice * quantity : 0

  if (loadingInit) return (
    <><Header />
    <div className="order-page">
      <div className="order-topbar">
        <button className="order-topbar__back" onClick={() => navigate('home')}>‹</button>
        <span className="order-topbar__title">Order Water</span>
      </div>
      <div className="order-loading">Loading…</div>
    </div></>
  )

  if (done) return (
    <><Header />
    <div className="order-page">
      <div className="order-topbar">
        <button className="order-topbar__back" onClick={() => navigate('home')}>‹</button>
        <span className="order-topbar__title">Order Water</span>
      </div>
      <div className="order-body">
        <div className="order-success">
          <div className="order-success__icon">✓</div>
          <div className="order-success__title">Order Placed!</div>
          <div className="order-success__sub">All vendors in {deliveryCity} have been notified.</div>
          <div className="order-success__number">{orderNum}</div>
          {orderOtp ? (
            <div className="order-success__otp">
              <div className="order-success__otp-label">🔑 Delivery Confirmation OTP</div>
              <div className="order-success__otp-code">{orderOtp}</div>
              <div className="order-success__otp-sub">
                Share this OTP with your delivery partner to confirm delivery.
              </div>
            </div>
          ) : (
            <div className="order-success__otp">
              <div className="order-success__otp-label">🔑 Delivery Confirmation OTP</div>
              <div className="order-success__otp-sub">
                A delivery OTP has been sent to you. Share it with your delivery partner when they deliver your water.
              </div>
            </div>
          )}
          <div className="order-success__actions">
            <button className="order-btn-next" onClick={() => navigate('profile', undefined, 'panel=orders')}>
              View My Orders
            </button>
            <button className="order-btn-back" onClick={() => navigate('home')}>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    </div></>
  )

  return (
    <><Header />
    <div className="order-page">
      <div className="order-topbar">
        <button className="order-topbar__back" onClick={() => step === 1 ? navigate('home') : setStep(s => s - 1)}>‹</button>
        <span className="order-topbar__title">Order Water</span>
      </div>

      {/* Step indicator */}
      <div className="order-steps">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1
          const cls = n < step ? 'order-step order-step--done' : n === step ? 'order-step order-step--active' : 'order-step'
          return (
            <>
              {i > 0 && (
                <div key={`c${n}`} className={`order-step__connector${n <= step ? ' order-step__connector--done' : ''}`} />
              )}
              <div key={n} className={cls}>
                <div className="order-step__dot">
                  {n < step ? <CheckIcon /> : n}
                </div>
                <span className="order-step__label">{label}</span>
              </div>
            </>
          )
        })}
      </div>

      <div className="order-body">
        {error && <div className="order-alert">{error}</div>}

        {/* ── Step 1: Tanker Type ── */}
        {step === 1 && (
          <>
            <h2 className="order-section-title">Select Tanker Type</h2>
            <p className="order-section-sub">Choose the water volume that fits your need</p>

            <div className="order-tanker-grid">
              {tankerTypes.map(t => (
                <div
                  key={t.id}
                  className={`order-tanker-card${selectedTypeId === t.id ? ' order-tanker-card--selected' : ''}`}
                  onClick={() => { setSelectedTypeId(t.id); setError('') }}
                >
                  <div className="order-tanker-card__check">
                    {selectedTypeId === t.id && <CheckIcon />}
                  </div>
                  <div className="order-tanker-card__icon">
                    {tankerImgSrc(t.imageUrl)
                      ? <img src={tankerImgSrc(t.imageUrl)!} alt={t.name} className="order-tanker-card__img" />
                      : <span>🚛</span>
                    }
                  </div>
                  <div className="order-tanker-card__name">{t.name}</div>
                  <div className="order-tanker-card__capacity">
                    {(t.capacityLitres / 1000).toFixed(t.capacityLitres % 1000 === 0 ? 0 : 1)}K Litres
                  </div>
                  <div className="order-tanker-card__price">₹{t.basePrice.toLocaleString('en-IN')}</div>
                </div>
              ))}
            </div>

            {selectedType && (
              <div className="order-tanker-qty">
                <span className="order-tanker-qty__label">Quantity</span>
                <div className="order-tanker-qty__control">
                  <button
                    className="order-tanker-qty__btn"
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                  >−</button>
                  <span className="order-tanker-qty__val">{quantity}</span>
                  <button
                    className="order-tanker-qty__btn"
                    onClick={() => setQuantity(q => q + 1)}
                  >+</button>
                </div>
                <span className="order-tanker-qty__total">
                  Total: <strong>₹{totalPrice.toLocaleString('en-IN')}</strong>
                </span>
              </div>
            )}

            <div className="order-actions" style={{ marginTop: 32 }}>
              <button className="order-btn-next order-btn-next--large" onClick={goToStep2}>
                Continue →
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Delivery Address ── */}
        {step === 2 && (
          <>
            <h2 className="order-section-title">Delivery Address</h2>
            <p className="order-section-sub">Where should we deliver your water?</p>

            <div className="order-addr-grid">
              {savedAddresses.map(addr => (
                <div
                  key={addr.id}
                  className={`order-addr-card${selectedId === addr.id && !showNew ? ' order-addr-card--selected' : ''}`}
                  onClick={() => { setSelectedId(addr.id); setShowNew(false); setPincode(addr.pincode ?? ''); setAddrErrors(e => ({ ...e, pincode: '' })) }}
                >
                  <div className="order-addr-card__check">
                    {selectedId === addr.id && !showNew && <CheckIcon />}
                  </div>
                  {addr.label && <div className="order-addr-card__label">{addr.label}</div>}
                  <p className="order-addr-card__text">{formatAddr(addr)}</p>
                </div>
              ))}

              <div
                className={`order-new-addr-card${showNew ? ' order-new-addr-card--active' : ''}`}
                onClick={() => { setShowNew(true); setSelectedId(null) }}
              >
                <div className="order-new-addr-card__icon">+</div>
                Use a different address
              </div>
            </div>

            {showNew && (
              <div className="order-new-addr-form">
                <div className="oaf-row">
                  <div className="oaf-field">
                    <label className="oaf-label">Door No.</label>
                    <input className="oaf-input" placeholder="e.g. 12B"
                      value={newAddr.doorNo} onChange={e => setNewAddr(f => ({ ...f, doorNo: e.target.value }))} />
                  </div>
                  <div className="oaf-field">
                    <label className="oaf-label">Plot / Flat No.</label>
                    <input className="oaf-input" placeholder="e.g. Plot 7"
                      value={newAddr.plotNo} onChange={e => setNewAddr(f => ({ ...f, plotNo: e.target.value }))} />
                  </div>
                </div>
                <div className="oaf-row">
                  <div className="oaf-field oaf-field--full">
                    <label className="oaf-label">Building Name</label>
                    <input className="oaf-input" placeholder="Apartment / complex name"
                      value={newAddr.buildingName} onChange={e => setNewAddr(f => ({ ...f, buildingName: e.target.value }))} />
                  </div>
                </div>
                <div className="oaf-row">
                  <div className="oaf-field">
                    <label className="oaf-label">Street <span>*</span></label>
                    <input className={`oaf-input${addrErrors.streetName ? ' oaf-input--error' : ''}`}
                      placeholder="Street / road name" value={newAddr.streetName}
                      onChange={e => { setNewAddr(f => ({ ...f, streetName: e.target.value })); setAddrErrors(er => ({ ...er, streetName: '' })) }} />
                    {addrErrors.streetName && <span className="oaf-error">{addrErrors.streetName}</span>}
                  </div>
                  <div className="oaf-field">
                    <label className="oaf-label">Area / Locality <span>*</span></label>
                    <input className={`oaf-input${addrErrors.areaName ? ' oaf-input--error' : ''}`}
                      placeholder="Area name" value={newAddr.areaName}
                      onChange={e => { setNewAddr(f => ({ ...f, areaName: e.target.value })); setAddrErrors(er => ({ ...er, areaName: '' })) }} />
                    {addrErrors.areaName && <span className="oaf-error">{addrErrors.areaName}</span>}
                  </div>
                </div>
                <div className="oaf-row">
                  <div className="oaf-field">
                    <label className="oaf-label">City <span>*</span></label>
                    <select className={`oaf-select${addrErrors.cityId ? ' oaf-select--error' : ''}`}
                      value={newAddr.cityId} onChange={e => handleCityChange(e.target.value)}>
                      <option value="">— Select city —</option>
                      {cityGroups.map(([stateName, sc]) => (
                        <optgroup key={stateName} label={stateName}>
                          {sc.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    {addrErrors.cityId && <span className="oaf-error">{addrErrors.cityId}</span>}
                  </div>
                  <div className="oaf-field">
                    <label className="oaf-label">State</label>
                    <input className="oaf-input oaf-input--readonly" value={newAddr.state}
                      readOnly tabIndex={-1} placeholder="Auto-filled from city" />
                  </div>
                </div>
              </div>
            )}

            <div className="oaf-row">
              <div className="oaf-field oaf-field--full">
                <label className="oaf-label">Pincode <span>*</span></label>
                <input className={`oaf-input${addrErrors.pincode ? ' oaf-input--error' : ''}`}
                  inputMode="numeric" maxLength={6} placeholder="6-digit pincode" value={pincode}
                  onChange={e => { setPincode(e.target.value.replace(/\D/g, '').slice(0, 6)); setAddrErrors(er => ({ ...er, pincode: '' })) }} />
                {addrErrors.pincode && <span className="oaf-error">{addrErrors.pincode}</span>}
              </div>
            </div>

            <div className="order-actions" style={{ marginTop: 32 }}>
              <button className="order-btn-next" onClick={goToStep3}>Continue →</button>
              <button className="order-btn-back" onClick={() => setStep(1)}>← Back</button>
            </div>
          </>
        )}

        {/* ── Step 3: Delivery Time ── */}
        {step === 3 && (
          <>
            <h2 className="order-section-title">Delivery Time</h2>
            <p className="order-section-sub">When would you like your water delivered?</p>

            <div className="order-delivery-type">
              <div className="order-delivery-toggle">
                <button
                  className={`order-delivery-opt${deliveryType === 'asap' ? ' order-delivery-opt--active' : ''}`}
                  onClick={() => { setDeliveryType('asap'); setScheduledAt(''); setError('') }}
                >
                  <span className="order-delivery-opt__icon">⚡</span>
                  <span className="order-delivery-opt__title">ASAP</span>
                  <span className="order-delivery-opt__sub">Deliver as soon as possible</span>
                </button>
                <button
                  className={`order-delivery-opt${deliveryType === 'scheduled' ? ' order-delivery-opt--active' : ''}`}
                  onClick={() => { setDeliveryType('scheduled'); setError('') }}
                >
                  <span className="order-delivery-opt__icon">📅</span>
                  <span className="order-delivery-opt__title">Scheduled</span>
                  <span className="order-delivery-opt__sub">Pick a date &amp; time</span>
                </button>
              </div>

              {deliveryType === 'scheduled' && (
                <div className="order-schedule-wrap">
                  <label className="order-schedule-label">Select Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    className="order-schedule-input"
                    value={scheduledAt}
                    min={minDateTime}
                    onChange={e => { setScheduledAt(e.target.value); setError('') }}
                  />
                </div>
              )}
            </div>

            {/* Site type */}
            <div className="order-site-section">
              <div className="order-section-title" style={{ fontSize: '0.95rem', marginBottom: 12 }}>Site Type <span className="order-req">*</span></div>
              <p className="order-section-sub">What kind of site are we delivering to?</p>
              <div className="order-delivery-toggle">
                {SITE_TYPES.map(st => (
                  <button
                    key={st.key}
                    className={`order-delivery-opt${siteType === st.key ? ' order-delivery-opt--active' : ''}`}
                    onClick={() => { setSiteType(st.key); setSiteSubType(''); setError('') }}
                    type="button"
                  >
                    <span className="order-delivery-opt__icon">{st.icon}</span>
                    <span className="order-delivery-opt__title">{st.key}</span>
                  </button>
                ))}
              </div>

              {siteType && siteType !== 'Residential' && (
                <div className="order-schedule-wrap">
                  <label className="order-schedule-label">Select {siteType} site type <span className="order-req">*</span></label>
                  <select
                    className="oaf-select"
                    value={siteSubType}
                    onChange={e => { setSiteSubType(e.target.value); setError('') }}
                  >
                    <option value="">— Select —</option>
                    {SITE_SUB_TYPES[siteType]?.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Time slab */}
            <div className="order-site-section">
              <div className="order-section-title" style={{ fontSize: '0.95rem', marginBottom: 12 }}>How long should the tanker stay? <span className="order-req">*</span></div>
              <p className="order-section-sub">Choose the time slab during which the tanker should be at your site</p>
              <div className="order-delivery-toggle">
                {TIME_SLABS.map(ts => (
                  <button
                    key={ts.key}
                    className={`order-delivery-opt${timeSlab === ts.key ? ' order-delivery-opt--active' : ''}`}
                    onClick={() => { setTimeSlab(ts.key); setError('') }}
                    type="button"
                  >
                    <span className="order-delivery-opt__icon">{ts.icon}</span>
                    <span className="order-delivery-opt__title">{ts.key}</span>
                    <span className="order-delivery-opt__sub">{ts.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {selectedType && (
              <div className="order-summary-strip">
                <span>{selectedType.name} × {quantity}</span>
                <strong>₹{totalPrice.toLocaleString('en-IN')}</strong>
              </div>
            )}

            <div className="order-actions">
              <button
                className="order-btn-next order-btn-next--large"
                onClick={goToStep4}
              >
                Review Order →
              </button>
              <button className="order-btn-back" onClick={() => setStep(2)}>← Back</button>
            </div>
          </>
        )}

        {/* ── Step 4: Review & Confirm ── */}
        {step === 4 && (() => {
          const addr = resolveAddress()
          return (
            <>
              <h2 className="order-section-title">Review Your Order</h2>
              <p className="order-section-sub">Check everything before placing your order</p>

              <div className="order-review-grid">
                <div className="order-review-card">
                  <div className="order-review-card__heading">Tanker</div>
                  <div className="order-review-card__title">{selectedType?.name ?? '—'}</div>
                  <div className="order-review-card__body">
                    {selectedType && (
                      <>
                        {(selectedType.capacityLitres / 1000).toFixed(selectedType.capacityLitres % 1000 === 0 ? 0 : 1)}K Litres
                        <br />Qty: {quantity}
                      </>
                    )}
                  </div>
                </div>

                <div className="order-review-card">
                  <div className="order-review-card__heading">Price</div>
                  <div className="order-review-card__title" style={{ color: 'var(--color-aqua)' }}>
                    ₹{totalPrice.toLocaleString('en-IN')}
                  </div>
                  <div className="order-review-card__body">
                    ₹{selectedType?.basePrice.toLocaleString('en-IN')} × {quantity}
                  </div>
                </div>

                <div className="order-review-card">
                  <div className="order-review-card__heading">Delivery Address</div>
                  <div className="order-review-card__body">
                    {addr
                      ? [
                          addr.doorNo, addr.plotNo, addr.buildingName, addr.streetName,
                          addr.areaName, addr.city, addr.state, addr.pincode
                        ].filter(Boolean).join(', ')
                      : '—'}
                  </div>
                </div>

                <div className="order-review-card">
                  <div className="order-review-card__heading">Delivery Details</div>
                  <div className="order-review-card__body">
                    <span>Site: {siteType || '—'}{siteSubType ? ` · ${siteSubType}` : ''}</span>
                    <br />
                    <span>Tanker stay: {timeSlab || '—'}</span>
                  </div>
                </div>

                <div className="order-review-card">
                  <div className="order-review-card__heading">Delivery Time</div>
                  <div className="order-review-card__title">
                    {deliveryType === 'asap' ? 'ASAP' : 'Scheduled'}
                  </div>
                  <div className="order-review-card__body">
                    {deliveryType === 'scheduled' && scheduledAt
                      ? new Date(scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                      : 'Deliver as soon as possible'}
                  </div>
                </div>
              </div>

              <div className="order-payment-select">
                <div className="order-section-title" style={{ fontSize: '0.95rem', marginBottom: 12 }}>Payment Method</div>
                <div className="order-delivery-toggle">
                  <button
                    className={`order-delivery-opt${paymentMethod === 'cod' ? ' order-delivery-opt--active' : ''}`}
                    onClick={() => setPaymentMethod('cod')}
                  >
                    <span className="order-delivery-opt__icon">💵</span>
                    <span className="order-delivery-opt__title">Cash on Delivery</span>
                    <span className="order-delivery-opt__sub">Pay when delivered</span>
                  </button>
                  <button
                    className={`order-delivery-opt${paymentMethod === 'online' ? ' order-delivery-opt--active' : ''}`}
                    onClick={() => setPaymentMethod('online')}
                  >
                    <span className="order-delivery-opt__icon">💳</span>
                    <span className="order-delivery-opt__title">Online Payment</span>
                    <span className="order-delivery-opt__sub">UPI, Cards, Net Banking</span>
                  </button>
                </div>
              </div>

              {error && <div className="order-alert">{error}</div>}

              <div className="order-actions">
                <button
                  className="order-btn-next order-btn-next--large"
                  onClick={handlePlace}
                  disabled={placing}
                >
                  {placing ? 'Placing Order…' : paymentMethod === 'online' ? '💳 Pay & Place Order' : '✓ Place Order (COD)'}
                </button>
                <button className="order-btn-back" onClick={() => setStep(3)}>← Back</button>
              </div>
            </>
          )
        })()}
      </div>
    </div>
    </>
  )
}
