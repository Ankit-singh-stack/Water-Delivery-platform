import { useState, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { registerDeliveryPartner, getPublicCities } from '../../utils/api'
import PasswordStrength, { checkPasswordStrength } from './PasswordStrength'
import type { AuthMode, OtpPending, PublicCity } from '../../types'
import './auth.css'

interface DeliveryPartnerSignupFormProps {
  onSwitch:  (mode: AuthMode) => void
  onOtp:     (data: OtpPending) => void
  onSuccess: () => void
}

interface FormState {
  firstName:      string
  lastName:       string
  email:          string
  phone:          string
  password:       string
  confirm:        string
  vehicleType:    string
  vehicleNumber:  string
  hasLicense:     boolean
  licenseNumber:  string
  serviceArea:    string
  cityId:         string
}

type FormErrors = Partial<Record<keyof FormState, string>>

const INITIAL: FormState = {
  firstName: '', lastName: '', email: '', phone: '', password: '', confirm: '',
  vehicleType: '', vehicleNumber: '', hasLicense: false, licenseNumber: '', serviceArea: '', cityId: '',
}

function apiErrMsg(code: string): string {
  const map: Record<string, string> = {
    email_exists:    'This email is already registered.',
    phone_exists:    'This phone number is already registered.',
    required_fields: 'Please fill in all required fields.',
    invalid_city:    'Selected city is invalid.',
    network_error:   'Network error — please check your connection.',
  }
  return map[code] ?? 'Something went wrong. Please try again.'
}

export default function DeliveryPartnerSignupForm({ onSwitch, onOtp, onSuccess }: DeliveryPartnerSignupFormProps) {
  const { t } = useTranslation()

  const [form,     setForm]     = useState<FormState>(INITIAL)
  const [errors,   setErrors]   = useState<FormErrors>({})
  const [apiError, setApiError] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [showPw,   setShowPw]   = useState(false)
  const [showCf,   setShowCf]   = useState(false)
  const [cities,   setCities]   = useState<PublicCity[]>([])
  const [citiesLoading, setCitiesLoading] = useState(true)

  useEffect(() => {
    getPublicCities().then(res => {
      setCities(res.success ? res.data : [])
      setCitiesLoading(false)
    })
  }, [])

  function update(field: keyof FormState, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }))
    if (apiError) setApiError('')
  }

  function validate(): FormErrors {
    const errs: FormErrors = {}
    if (!form.firstName.trim())  errs.firstName = t('auth.errors.required')
    if (!form.lastName.trim())   errs.lastName  = t('auth.errors.required')

    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
                                 errs.email = t('auth.errors.invalid_email')

    if (!form.phone.trim())      errs.phone = t('auth.errors.required')
    else if (!/^\d{10}$/.test(form.phone))
                                 errs.phone = t('auth.errors.invalid_phone')

    if (!form.password)          errs.password = t('auth.errors.required')
    else if (checkPasswordStrength(form.password).score < 4)
                                 errs.password = t('auth.errors.weak_password')

    if (!form.confirm)           errs.confirm = t('auth.errors.required')
    else if (form.password !== form.confirm)
                                 errs.confirm = t('auth.errors.passwords_mismatch')

    if (form.hasLicense && !form.licenseNumber.trim())
                                 errs.licenseNumber = t('auth.errors.required')

    if (!form.cityId)
                                 errs.cityId = t('auth.errors.required')

    return errs
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    const result = await registerDeliveryPartner({
      firstName:     form.firstName,
      lastName:      form.lastName,
      email:         form.email || undefined,
      phone:         form.phone,
      password:      form.password,
      vehicleType:   form.vehicleType || undefined,
      vehicleNumber: form.vehicleNumber || undefined,
      hasLicense:    form.hasLicense,
      licenseNumber: form.hasLicense ? form.licenseNumber : undefined,
      serviceArea:   form.serviceArea || undefined,
      cityId:        form.cityId,
    })
    setLoading(false)

    if (!result.success) {
      setApiError(apiErrMsg(result.error))
      return
    }

    if (!result.needsOtp) {
      onSuccess()
      return
    }

    onOtp({ userId: result.userId, phone: result.phone, devOtp: result.devOtp })
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit} noValidate>
      <h1 className="auth-card__title">{t('auth.delivery_signup.title')}</h1>
      <p  className="auth-card__subtitle">{t('auth.delivery_signup.subtitle')}</p>

      {apiError && <div className="auth-alert auth-alert--error">{apiError}</div>}

      {/* Name row */}
      <div className="auth-row">
        <Field label={t('auth.signup.first_name_label')} error={errors.firstName}>
          <input
            className={`auth-input${errors.firstName ? ' has-error' : ''}`}
            type="text" autoComplete="given-name"
            placeholder={t('auth.signup.first_name_placeholder')}
            value={form.firstName}
            onChange={e => update('firstName', e.target.value)}
            autoFocus
          />
        </Field>
        <Field label={t('auth.signup.last_name_label')} error={errors.lastName}>
          <input
            className={`auth-input${errors.lastName ? ' has-error' : ''}`}
            type="text" autoComplete="family-name"
            placeholder={t('auth.signup.last_name_placeholder')}
            value={form.lastName}
            onChange={e => update('lastName', e.target.value)}
          />
        </Field>
      </div>

      {/* Email */}
      <Field label={t('auth.signup.email_label')} error={errors.email}>
        <input
          className={`auth-input${errors.email ? ' has-error' : ''}`}
          type="email" autoComplete="email"
          placeholder={t('auth.signup.email_placeholder')}
          value={form.email}
          onChange={e => update('email', e.target.value)}
        />
      </Field>

      {/* Phone */}
      <Field label={t('auth.signup.phone_label')} error={errors.phone}>
        <div className="auth-input-wrap auth-phone-wrap">
          <span className="auth-phone-prefix">+91</span>
          <input
            className={`auth-input auth-input--phone${errors.phone ? ' has-error' : ''}`}
            type="tel" autoComplete="tel" inputMode="numeric"
            placeholder={t('auth.signup.phone_placeholder')}
            maxLength={10}
            value={form.phone}
            onChange={e => update('phone', e.target.value.replace(/\D/g, ''))}
          />
        </div>
      </Field>

      {/* Password */}
      <Field label={t('auth.signup.password_label')} error={errors.password}>
        <div className="auth-input-wrap">
          <input
            className={`auth-input auth-input--has-icon${errors.password ? ' has-error' : ''}`}
            type={showPw ? 'text' : 'password'} autoComplete="new-password"
            placeholder={t('auth.signup.password_placeholder')}
            value={form.password}
            onChange={e => update('password', e.target.value)}
          />
          <button type="button" className="auth-input-icon"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? t('auth.password.hide') : t('auth.password.show')}>
            {showPw ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        <PasswordStrength password={form.password} />
      </Field>

      {/* Confirm password */}
      <Field label={t('auth.signup.confirm_label')} error={errors.confirm}>
        <div className="auth-input-wrap">
          <input
            className={`auth-input auth-input--has-icon${errors.confirm ? ' has-error' : ''}`}
            type={showCf ? 'text' : 'password'} autoComplete="new-password"
            placeholder={t('auth.signup.confirm_placeholder')}
            value={form.confirm}
            onChange={e => update('confirm', e.target.value)}
          />
          <button type="button" className="auth-input-icon"
                  onClick={() => setShowCf(v => !v)}
                  aria-label={showCf ? t('auth.password.hide') : t('auth.password.show')}>
            {showCf ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </Field>

      {/* Vehicle details */}
      <div className="auth-row">
        <Field label={t('auth.delivery_signup.vehicle_type_label')} error={errors.vehicleType}>
          <input
            className={`auth-input${errors.vehicleType ? ' has-error' : ''}`}
            type="text"
            placeholder={t('auth.delivery_signup.vehicle_type_placeholder')}
            value={form.vehicleType}
            onChange={e => update('vehicleType', e.target.value)}
          />
        </Field>
        <Field label={t('auth.delivery_signup.vehicle_number_label')} error={errors.vehicleNumber}>
          <input
            className={`auth-input${errors.vehicleNumber ? ' has-error' : ''}`}
            type="text"
            placeholder={t('auth.delivery_signup.vehicle_number_placeholder')}
            value={form.vehicleNumber}
            onChange={e => update('vehicleNumber', e.target.value)}
          />
        </Field>
      </div>

      <Field label={t('auth.delivery_signup.service_area_label')} error={errors.serviceArea}>
        <input
          className={`auth-input${errors.serviceArea ? ' has-error' : ''}`}
          type="text"
          placeholder={t('auth.delivery_signup.service_area_placeholder')}
          value={form.serviceArea}
          onChange={e => update('serviceArea', e.target.value)}
        />
      </Field>

      <Field label="City *" error={errors.cityId}>
        <select
          className={`auth-input${errors.cityId ? ' has-error' : ''}`}
          value={form.cityId}
          onChange={e => update('cityId', e.target.value)}
          disabled={citiesLoading}
          aria-label="City you serve"
        >
          <option value="">
            {citiesLoading ? 'Loading…' : cities.length === 0 ? '— No cities listed —' : '— Select your city —'}
          </option>
          {cities.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>

      <label className="auth-check">
        <input type="checkbox" checked={form.hasLicense}
               onChange={e => update('hasLicense', e.target.checked)} />
        {t('auth.delivery_signup.has_license_label')}
      </label>

      {form.hasLicense && (
        <Field label={t('auth.delivery_signup.license_number_label')} error={errors.licenseNumber}>
          <input
            className={`auth-input${errors.licenseNumber ? ' has-error' : ''}`}
            type="text"
            placeholder={t('auth.delivery_signup.license_number_placeholder')}
            value={form.licenseNumber}
            onChange={e => update('licenseNumber', e.target.value)}
          />
        </Field>
      )}

      <button
        type="submit"
        className={`auth-btn${loading ? ' auth-btn--loading' : ''}`}
        disabled={loading}
      >
        {!loading && t('auth.delivery_signup.register_btn')}
      </button>

      <p className="auth-switch">
        {t('auth.signup.have_account')}{' '}
        <button type="button" onClick={() => onSwitch('login')}>
          {t('auth.signup.login_link')}
        </button>
      </p>
      <p className="auth-switch" style={{ marginTop: 6 }}>
        Registering as a water vendor?{' '}
        <button type="button" onClick={() => onSwitch('vendor-signup')}>
          Register your business
        </button>
      </p>
    </form>
  )
}

/* ── Reusable field wrapper ── */
interface FieldProps {
  label?:   string
  error?:   string
  children: ReactNode
}

function Field({ label, error, children }: FieldProps) {
  return (
    <div className="auth-field">
      {label && <span className="auth-label">{label}</span>}
      {children}
      {error && <span className="auth-field-error">⚠ {error}</span>}
    </div>
  )
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}
