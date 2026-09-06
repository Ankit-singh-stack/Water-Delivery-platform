import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getProfile, requestProfileUpdate, confirmProfileUpdate, updateSessionName,
  getVendorProfile, updateVendorProfile, getPublicCities,
} from '../../../utils/api'
import OtpModal from '../../../components/OtpModal/OtpModal'
import type { UserProfile, VendorProfile, PublicCity } from '../../../types'

export default function GeneralInfo() {
  const { t } = useTranslation()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [alert,   setAlert]   = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [otpData, setOtpData] = useState<{ phone: string; devOtp?: string } | null>(null)

  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' })
  const [errors, setErrors] = useState<Partial<typeof form>>({})

  // Vendor-specific state
  const [vendorProfile, setVendorProfile]     = useState<VendorProfile | null>(null)
  const [cities,        setCities]            = useState<PublicCity[]>([])
  const [vendorForm,    setVendorForm]        = useState({ companyName: '', streetName: '', areaName: '', cityId: '', pincode: '' })
  const [vendorErrors,  setVendorErrors]      = useState<Partial<typeof vendorForm>>({})
  const [vendorSaving,  setVendorSaving]      = useState(false)
  const [vendorAlert,   setVendorAlert]       = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const cityGroups = useMemo(() => {
    const map = new Map<string, PublicCity[]>()
    for (const c of cities) {
      if (!map.has(c.stateName)) map.set(c.stateName, [])
      map.get(c.stateName)!.push(c)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [cities])

  const selectedCity = useMemo(() => cities.find(c => c.id === vendorForm.cityId) ?? null, [cities, vendorForm.cityId])

  useEffect(() => {
    Promise.all([getProfile(), getVendorProfile(), getPublicCities()]).then(([pr, vr, cr]) => {
      if (pr.success) {
        setProfile(pr.data)
        setForm({ firstName: pr.data.firstName, lastName: pr.data.lastName, email: pr.data.email ?? '' })
      }
      if (vr.success && vr.data) {
        setVendorProfile(vr.data)
        setVendorForm({
          companyName: vr.data.companyName,
          streetName:  vr.data.streetName,
          areaName:    vr.data.areaName,
          cityId:      vr.data.cityId,
          pincode:     vr.data.pincode,
        })
      }
      if (cr.success) setCities(cr.data)
      setLoading(false)
    })
  }, [])

  function validate(): boolean {
    const errs: Partial<typeof form> = {}
    if (!form.firstName.trim()) errs.firstName = t('auth.errors.required')
    if (!form.lastName.trim())  errs.lastName  = t('auth.errors.required')
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = t('auth.errors.invalid_email')
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    const res = await requestProfileUpdate(form.firstName, form.lastName)
    if (!res.success) { setSaving(false); setAlert({ type: 'error', msg: res.error }); return }

    if (!res.otpRequired) {
      const confirmRes = await confirmProfileUpdate(form)
      setSaving(false)
      if (!confirmRes.success) { setAlert({ type: 'error', msg: confirmRes.error }); return }
      setProfile(confirmRes.data)
      updateSessionName(confirmRes.data.firstName, confirmRes.data.lastName)
      setAlert({ type: 'success', msg: t('profile.general.saved') })
      return
    }

    setSaving(false)
    setOtpData({ phone: res.phone, devOtp: res.devOtp })
  }

  async function handleOtpVerify(code: string): Promise<string | null> {
    const res = await confirmProfileUpdate({ ...form, otp: code })
    if (!res.success) return res.error
    setProfile(res.data)
    updateSessionName(res.data.firstName, res.data.lastName)
    setOtpData(null)
    setAlert({ type: 'success', msg: t('profile.general.saved') })
    return null
  }

  async function handleOtpResend() {
    const res = await requestProfileUpdate(form.firstName, form.lastName)
    if (!res.success) return { error: res.error }
    return { devOtp: res.devOtp }
  }

  function validateVendor(): boolean {
    const errs: Partial<typeof vendorForm> = {}
    if (!vendorForm.companyName.trim()) errs.companyName = 'Required'
    if (!vendorForm.streetName.trim())  errs.streetName  = 'Required'
    if (!vendorForm.areaName.trim())    errs.areaName    = 'Required'
    if (!vendorForm.cityId)             errs.cityId      = 'Please select a city'
    if (!vendorForm.pincode.trim())     errs.pincode     = 'Required'
    setVendorErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleVendorSave() {
    if (!validateVendor()) return
    setVendorSaving(true)
    setVendorAlert(null)
    const res = await updateVendorProfile(vendorForm)
    setVendorSaving(false)
    if (!res.success) { setVendorAlert({ type: 'error', msg: res.error }); return }
    setVendorProfile(res.data)
    setVendorAlert({ type: 'success', msg: 'Business information saved.' })
  }

  if (loading) return (
    <div className="panel-card"><div className="panel-loading"><div className="spinner" />{t('common.loading')}</div></div>
  )

  return (
    <>
      <div className="panel-card">
        <h2 className="panel__title">{t('profile.general.title')}</h2>
        <p className="panel__subtitle">{t('profile.general.subtitle')}</p>

        {alert && (
          <div className={`alert alert--${alert.type}`}>{alert.msg}</div>
        )}

        <div className="form-row" style={{ marginBottom: 16 }}>
          <div className="form-field">
            <label className="form-label">{t('auth.signup.first_name_label')} <span>*</span></label>
            <input
              className={`form-input${errors.firstName ? ' form-input--error' : ''}`}
              value={form.firstName}
              onChange={e => { setForm(f => ({ ...f, firstName: e.target.value })); setErrors(e2 => ({ ...e2, firstName: '' })) }}
              placeholder={t('auth.signup.first_name_placeholder')}
            />
            {errors.firstName && <span className="field-error">{errors.firstName}</span>}
          </div>
          <div className="form-field">
            <label className="form-label">{t('auth.signup.last_name_label')} <span>*</span></label>
            <input
              className={`form-input${errors.lastName ? ' form-input--error' : ''}`}
              value={form.lastName}
              onChange={e => { setForm(f => ({ ...f, lastName: e.target.value })); setErrors(e2 => ({ ...e2, lastName: '' })) }}
              placeholder={t('auth.signup.last_name_placeholder')}
            />
            {errors.lastName && <span className="field-error">{errors.lastName}</span>}
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label className="form-label">{t('auth.signup.email_label')}</label>
            <input
              className={`form-input${errors.email ? ' form-input--error' : ''}`}
              type="email"
              value={form.email}
              onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setErrors(e2 => ({ ...e2, email: '' })) }}
              placeholder={t('auth.signup.email_placeholder')}
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>
          <div className="form-field">
            <label className="form-label">{t('auth.signup.phone_label')}</label>
            <input className="form-input" value={profile?.phone ?? ''} disabled />
          </div>
        </div>

        <div className="btn-row">
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? t('common.saving') : t('profile.general.save_btn')}
          </button>
        </div>
      </div>

      {vendorProfile && (
        <div className="panel-card" style={{ marginTop: 24 }}>
          <h2 className="panel__title">Business Information</h2>
          <p className="panel__subtitle">Update your company name and address visible to customers.</p>

          {vendorAlert && (
            <div className={`alert alert--${vendorAlert.type}`}>{vendorAlert.msg}</div>
          )}

          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="form-field form-field--full">
              <label className="form-label">Company Name <span>*</span></label>
              <input
                className={`form-input${vendorErrors.companyName ? ' form-input--error' : ''}`}
                value={vendorForm.companyName}
                onChange={e => { setVendorForm(f => ({ ...f, companyName: e.target.value })); setVendorErrors(e2 => ({ ...e2, companyName: '' })) }}
                placeholder="Your company or business name"
              />
              {vendorErrors.companyName && <span className="field-error">{vendorErrors.companyName}</span>}
            </div>
          </div>

          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="form-field">
              <label className="form-label">Street <span>*</span></label>
              <input
                className={`form-input${vendorErrors.streetName ? ' form-input--error' : ''}`}
                value={vendorForm.streetName}
                onChange={e => { setVendorForm(f => ({ ...f, streetName: e.target.value })); setVendorErrors(e2 => ({ ...e2, streetName: '' })) }}
                placeholder="Street / road name"
              />
              {vendorErrors.streetName && <span className="field-error">{vendorErrors.streetName}</span>}
            </div>
            <div className="form-field">
              <label className="form-label">Area / Locality <span>*</span></label>
              <input
                className={`form-input${vendorErrors.areaName ? ' form-input--error' : ''}`}
                value={vendorForm.areaName}
                onChange={e => { setVendorForm(f => ({ ...f, areaName: e.target.value })); setVendorErrors(e2 => ({ ...e2, areaName: '' })) }}
                placeholder="Area or locality"
              />
              {vendorErrors.areaName && <span className="field-error">{vendorErrors.areaName}</span>}
            </div>
          </div>

          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="form-field">
              <label className="form-label">City <span>*</span></label>
              <select
                className={`form-input form-select${vendorErrors.cityId ? ' form-input--error' : ''}`}
                value={vendorForm.cityId}
                onChange={e => { setVendorForm(f => ({ ...f, cityId: e.target.value })); setVendorErrors(e2 => ({ ...e2, cityId: '' })) }}
              >
                <option value="">— Select city —</option>
                {cityGroups.map(([stateName, sc]) => (
                  <optgroup key={stateName} label={stateName}>
                    {sc.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ))}
              </select>
              {vendorErrors.cityId && <span className="field-error">{vendorErrors.cityId}</span>}
            </div>
            <div className="form-field">
              <label className="form-label">State</label>
              <input
                className="form-input form-input--readonly"
                value={selectedCity?.stateName ?? vendorProfile.stateName}
                readOnly
                tabIndex={-1}
                placeholder="Auto-filled from city"
              />
            </div>
          </div>

          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="form-field">
              <label className="form-label">Pincode <span>*</span></label>
              <input
                className={`form-input${vendorErrors.pincode ? ' form-input--error' : ''}`}
                value={vendorForm.pincode}
                onChange={e => { setVendorForm(f => ({ ...f, pincode: e.target.value })); setVendorErrors(e2 => ({ ...e2, pincode: '' })) }}
                placeholder="6-digit pincode"
                maxLength={6}
              />
              {vendorErrors.pincode && <span className="field-error">{vendorErrors.pincode}</span>}
            </div>
          </div>

          <div className="btn-row">
            <button className="btn-primary" onClick={handleVendorSave} disabled={vendorSaving}>
              {vendorSaving ? 'Saving…' : 'Save Business Info'}
            </button>
          </div>
        </div>
      )}

      {otpData && (
        <OtpModal
          phone={otpData.phone}
          devOtp={otpData.devOtp}
          onVerify={handleOtpVerify}
          onResend={handleOtpResend}
          onClose={() => setOtpData(null)}
        />
      )}
    </>
  )
}
