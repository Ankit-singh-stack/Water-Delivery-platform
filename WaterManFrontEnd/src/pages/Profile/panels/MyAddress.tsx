import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getAddresses, addAddress, updateAddress, deleteAddress } from '../../../utils/api'
import { getPublicCities } from '../../../utils/api'
import type { Address, AddressInput, PublicCity } from '../../../types'

const EMPTY_FORM: AddressInput = {
  label: '', doorNo: '', plotNo: '', buildingName: '',
  streetName: '', areaName: '', city: '', state: '', country: 'India', isDefault: false,
}

type FormErrors = Partial<Record<keyof AddressInput, string>>

export default function MyAddress() {
  const { t } = useTranslation()
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading]     = useState(true)
  const [formMode, setFormMode]   = useState<'hidden' | 'add' | string>('hidden')
  const [form, setForm]           = useState<AddressInput>(EMPTY_FORM)
  const [errors, setErrors]       = useState<FormErrors>({})
  const [saving, setSaving]       = useState(false)
  const [alert, setAlert]         = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const [cities, setCities]       = useState<PublicCity[]>([])
  const [cityId, setCityId]       = useState('')   // tracks the selected city's id for the <select>

  useEffect(() => {
    Promise.all([
      getAddresses(),
      getPublicCities(),
    ]).then(([addrRes, cityRes]) => {
      if (addrRes.success) setAddresses(addrRes.data)
      if (cityRes.success) setCities(cityRes.data)
      setLoading(false)
    })
  }, [])

  // Cities grouped by state name for <optgroup>
  const cityGroups = useMemo(() => {
    const map = new Map<string, PublicCity[]>()
    for (const c of cities) {
      if (!map.has(c.stateName)) map.set(c.stateName, [])
      map.get(c.stateName)!.push(c)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [cities])

  function handleCityChange(id: string) {
    setCityId(id)
    const found = cities.find(c => c.id === id)
    setForm(f => ({
      ...f,
      city:  found ? found.name      : '',
      state: found ? found.stateName : '',
    }))
    setErrors(e => ({ ...e, city: '', state: '' }))
  }

  function validate(): boolean {
    const errs: FormErrors = {}
    if (!form.streetName?.trim()) errs.streetName = t('auth.errors.required')
    if (!form.areaName?.trim())   errs.areaName   = t('auth.errors.required')
    if (!form.city?.trim())       errs.city       = t('auth.errors.required')
    if (!form.state?.trim())      errs.state      = t('auth.errors.required')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function openAdd() {
    setForm(EMPTY_FORM)
    setCityId('')
    setErrors({})
    setFormMode('add')
  }

  function openEdit(addr: Address) {
    // Try to match the saved city name back to a city in the list
    const matched = cities.find(c => c.name.toLowerCase() === addr.city.toLowerCase())
    setCityId(matched?.id ?? '')
    setForm({
      label: addr.label ?? '', doorNo: addr.doorNo ?? '', plotNo: addr.plotNo ?? '',
      buildingName: addr.buildingName ?? '', streetName: addr.streetName,
      areaName: addr.areaName, city: addr.city, state: addr.state,
      country: addr.country, isDefault: addr.isDefault,
    })
    setErrors({})
    setFormMode(addr.id)
  }

  function closeForm() { setFormMode('hidden') }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    const isEditing = formMode !== 'add'
    const res = isEditing
      ? await updateAddress(formMode as string, form)
      : await addAddress(form)
    setSaving(false)
    if (!res.success) { setAlert({ type: 'error', msg: res.error }); return }

    if (form.isDefault) {
      setAddresses(prev => prev.map(a => ({ ...a, isDefault: false })))
    }
    if (isEditing) {
      setAddresses(prev => prev.map(a => a.id === res.data.id ? res.data : a))
    } else {
      setAddresses(prev => [res.data, ...prev])
    }
    closeForm()
    setAlert({ type: 'success', msg: t('profile.addresses.saved') })
  }

  async function confirmAndDelete(id: string) {
    setConfirmDeleteId(null)
    const res = await deleteAddress(id)
    if (!res.success) { setAlert({ type: 'error', msg: res.error }); return }
    setAddresses(prev => prev.filter(a => a.id !== id))
  }

  function field(key: keyof AddressInput, label: string, required = false, placeholder = '') {
    return (
      <div className="form-field">
        <label className="form-label">{label}{required && <span> *</span>}</label>
        <input
          className={`form-input${errors[key] ? ' form-input--error' : ''}`}
          value={(form[key] as string) ?? ''}
          placeholder={placeholder}
          onChange={e => {
            setForm(f => ({ ...f, [key]: e.target.value }))
            setErrors(err => ({ ...err, [key]: '' }))
          }}
        />
        {errors[key] && <span className="field-error">{errors[key]}</span>}
      </div>
    )
  }

  function formatAddress(a: Address): string {
    return [a.doorNo, a.plotNo, a.buildingName, a.streetName, a.areaName, a.city, a.state, a.country]
      .filter(Boolean).join(', ')
  }

  if (loading) return (
    <div className="panel-card"><div className="panel-loading"><div className="spinner" /></div></div>
  )

  return (
    <div className="panel-card">
      <h2 className="panel__title">{t('profile.addresses.title')}</h2>
      <p className="panel__subtitle">{t('profile.addresses.subtitle')}</p>

      {alert && <div className={`alert alert--${alert.type}`}>{alert.msg}</div>}

      {formMode !== 'hidden' && (
        <div className="address-form-wrap">
          <h3>{formMode === 'add' ? t('profile.addresses.add_title') : t('profile.addresses.edit_title')}</h3>

          <div className="form-row" style={{ marginBottom: 14 }}>
            {field('label',        t('profile.addresses.label'),         false, 'Home, Office…')}
            {field('doorNo',       t('profile.addresses.door_no'),       false)}
          </div>
          <div className="form-row" style={{ marginBottom: 14 }}>
            {field('plotNo',       t('profile.addresses.plot_no'),       false)}
            {field('buildingName', t('profile.addresses.building_name'), false)}
          </div>
          <div className="form-row" style={{ marginBottom: 14 }}>
            {field('streetName',   t('profile.addresses.street_name'),   true)}
            {field('areaName',     t('profile.addresses.area_name'),     true)}
          </div>

          {/* City dropdown + auto-filled State */}
          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-field">
              <label className="form-label">{t('profile.addresses.city')} <span>*</span></label>
              <select
                className={`form-input form-select${errors.city ? ' form-input--error' : ''}`}
                value={cityId}
                onChange={e => handleCityChange(e.target.value)}
              >
                <option value="">— Select city —</option>
                {cityGroups.map(([stateName, stateCities]) => (
                  <optgroup key={stateName} label={stateName}>
                    {stateCities.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {errors.city && <span className="field-error">{errors.city}</span>}
            </div>

            <div className="form-field">
              <label className="form-label">{t('profile.addresses.state')}</label>
              <input
                className="form-input form-input--readonly"
                value={form.state}
                readOnly
                tabIndex={-1}
                placeholder="Auto-filled from city"
              />
            </div>
          </div>

          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="form-field">
              <label className="form-label">{t('profile.addresses.country')}</label>
              <input className="form-input form-input--readonly" value="India (IN)" readOnly tabIndex={-1} />
            </div>
            <div className="form-field">
              <label className="form-label">{t('profile.addresses.set_default')}</label>
              <div className="default-toggle-wrap">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={!!form.isDefault}
                    onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
                  />
                  <span className="toggle__track">
                    <span className="toggle__thumb" />
                  </span>
                </label>
                <span className="default-toggle-label">
                  {form.isDefault ? 'Yes, set as default' : 'No'}
                </span>
              </div>
            </div>
          </div>

          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? t('common.saving') : t('common.save')}
            </button>
            <button className="btn-secondary" onClick={closeForm}>{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {addresses.length === 0 && formMode === 'hidden' && (
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <p>{t('profile.addresses.empty')}</p>
        </div>
      )}

      {addresses.length > 0 && (
        <div className="address-grid">
          {addresses.map(addr => (
            <div key={addr.id} className={`address-card${addr.isDefault ? ' address-card--default' : ''}`}>
              {(addr.label || addr.isDefault) && (
                <div className="address-card__label">
                  {addr.label ?? t('profile.addresses.label_default')}
                  {addr.isDefault && <span className="badge-default">{t('profile.addresses.default')}</span>}
                </div>
              )}
              <p className="address-card__text">{formatAddress(addr)}</p>
              <div className="address-card__actions">
                <button className="btn-ghost" onClick={() => openEdit(addr)}>{t('common.edit')}</button>
                <button className="btn-danger" onClick={() => setConfirmDeleteId(addr.id)}>{t('common.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formMode === 'hidden' && (
        <button className="btn-primary" onClick={openAdd}>
          + {t('profile.addresses.add_btn')}
        </button>
      )}

      {confirmDeleteId !== null && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <p style={{ marginBottom: 16 }}>{t('profile.addresses.confirm_delete')}</p>
            <div className="btn-row">
              <button className="btn-secondary" onClick={() => setConfirmDeleteId(null)}>{t('common.cancel')}</button>
              <button className="btn-danger" onClick={() => confirmAndDelete(confirmDeleteId)}>{t('common.delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
