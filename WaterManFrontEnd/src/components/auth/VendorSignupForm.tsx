import { useState, useEffect, type ReactNode } from 'react'
import { registerVendor, getPublicStates, getPublicCities } from '../../utils/api'
import PasswordStrength, { checkPasswordStrength } from './PasswordStrength'
import type { AuthMode, OtpPending, State, PublicCity } from '../../types'
import './auth.css'
import './VendorSignupForm.css'

interface VendorSignupFormProps {
  onSwitch:  (mode: AuthMode) => void
  onOtp:     (data: OtpPending) => void
  onSuccess: () => void
}

// ── Step 1: personal details ─────────────────────────────────────────────────

interface PersonalForm {
  firstName: string
  lastName:  string
  email:     string
  phone:     string
  password:  string
  confirm:   string
}

type PersonalErrors = Partial<Record<keyof PersonalForm, string>>

const PERSONAL_INIT: PersonalForm = {
  firstName: '', lastName: '', email: '', phone: '', password: '', confirm: '',
}

// ── Step 2: company & address ────────────────────────────────────────────────

interface CompanyForm {
  companyName: string
  streetName:  string
  areaName:    string
  stateId:     string
  cityId:      string
  pincode:     string
}

type CompanyErrors = Partial<Record<keyof CompanyForm, string>>

const COMPANY_INIT: CompanyForm = {
  companyName: '', streetName: '', areaName: '', stateId: '', cityId: '', pincode: '',
}

// ── Error map ─────────────────────────────────────────────────────────────────

function apiErrMsg(code: string): string {
  const map: Record<string, string> = {
    email_exists:    'This email is already registered.',
    phone_exists:    'This phone number is already registered.',
    required_fields: 'Please fill in all required fields.',
    invalid_state:   'Selected state is invalid.',
    invalid_city:    'Selected city does not belong to the state.',
    network_error:   'Network error — please check your connection.',
  }
  return map[code] ?? 'Something went wrong. Please try again.'
}

// ── Shared Field wrapper ──────────────────────────────────────────────────────

function Field({ label, error, required, children }: { label: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="auth-field">
      <span className="auth-label">{label}{required && <span className="vs-required"> *</span>}</span>
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

// ── Main component ────────────────────────────────────────────────────────────

export default function VendorSignupForm({ onSwitch, onOtp, onSuccess }: VendorSignupFormProps) {
  const [step,     setStep]     = useState<1 | 2>(1)
  const [personal, setPersonal] = useState<PersonalForm>(PERSONAL_INIT)
  const [company,  setCompany]  = useState<CompanyForm>(COMPANY_INIT)
  const [pErrors,  setPErrors]  = useState<PersonalErrors>({})
  const [cErrors,  setCErrors]  = useState<CompanyErrors>({})
  const [apiError, setApiError] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [showPw,   setShowPw]   = useState(false)
  const [showCf,   setShowCf]   = useState(false)

  const [states,       setStates]       = useState<State[]>([])
  const [cities,       setCities]       = useState<PublicCity[]>([])
  const [citiesLoading, setCitiesLoading] = useState(false)

  // Load states once
  useEffect(() => {
    getPublicStates().then(res => { if (res.success) setStates(res.data) })
  }, [])

  // Reload cities when state changes
  useEffect(() => {
    if (!company.stateId) { setCities([]); return }
    setCitiesLoading(true)
    getPublicCities(company.stateId).then(res => {
      setCities(res.success ? res.data : [])
      setCitiesLoading(false)
    })
  }, [company.stateId])

  function updatePersonal(field: keyof PersonalForm, value: string) {
    setPersonal(f => ({ ...f, [field]: value }))
    if (pErrors[field]) setPErrors(e => ({ ...e, [field]: '' }))
    if (apiError) setApiError('')
  }

  function updateCompany(field: keyof CompanyForm, value: string) {
    setCompany(f => ({
      ...f,
      [field]: value,
      ...(field === 'stateId' ? { cityId: '' } : {}),
    }))
    if (cErrors[field]) setCErrors(e => ({ ...e, [field]: '' }))
    if (apiError) setApiError('')
  }

  // ── Step 1 validation ──────────────────────────────────────────────────────

  function validatePersonal(): PersonalErrors {
    const e: PersonalErrors = {}
    if (!personal.firstName.trim()) e.firstName = 'Required'
    if (!personal.lastName.trim())  e.lastName  = 'Required'
    if (!personal.email.trim())          e.email = 'Required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal.email)) e.email = 'Invalid email address'
    if (!personal.phone.trim())     e.phone = 'Required'
    else if (!/^\d{10}$/.test(personal.phone)) e.phone = 'Enter a 10-digit mobile number'
    if (!personal.password)              e.password = 'Required'
    else if (checkPasswordStrength(personal.password).score < 4) e.password = 'Password is too weak'
    if (!personal.confirm)               e.confirm = 'Required'
    else if (personal.password !== personal.confirm) e.confirm = 'Passwords do not match'
    return e
  }

  function handleNextStep(e: React.FormEvent) {
    e.preventDefault()
    const errs = validatePersonal()
    if (Object.keys(errs).length) { setPErrors(errs); return }
    setStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Step 2 validation ──────────────────────────────────────────────────────

  function validateCompany(): CompanyErrors {
    const e: CompanyErrors = {}
    if (!company.companyName.trim()) e.companyName = 'Required'
    if (!company.streetName.trim())  e.streetName  = 'Required'
    if (!company.areaName.trim())    e.areaName    = 'Required'
    if (!company.stateId)            e.stateId     = 'Please select a state'
    if (!company.pincode.trim())     e.pincode     = 'Required'
    else if (!/^\d{6}$/.test(company.pincode)) e.pincode = 'Enter a valid 6-digit pincode'
    return e
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validateCompany()
    if (Object.keys(errs).length) { setCErrors(errs); return }

    setLoading(true)
    setApiError('')
    const res = await registerVendor({
      firstName:   personal.firstName,
      lastName:    personal.lastName,
      email:       personal.email,
      phone:       personal.phone,
      password:    personal.password,
      companyName: company.companyName,
      streetName:  company.streetName,
      areaName:    company.areaName,
      cityId:      company.cityId,
      stateId:     company.stateId,
      pincode:     company.pincode,
    })
    setLoading(false)

    if (!res.success) { setApiError(apiErrMsg(res.error)); return }
    if (!res.needsOtp) { onSuccess(); return }
    onOtp({ userId: res.userId, phone: res.phone, devOtp: res.devOtp })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="auth-card vs-card">

      {/* Progress steps */}
      <div className="vs-steps">
        <div className={`vs-step ${step >= 1 ? 'vs-step--done' : ''}`}>
          <div className="vs-step__dot">{step > 1 ? '✓' : '1'}</div>
          <span className="vs-step__label">Your Details</span>
        </div>
        <div className="vs-step__line" />
        <div className={`vs-step ${step >= 2 ? 'vs-step--done' : 'vs-step--muted'}`}>
          <div className="vs-step__dot">2</div>
          <span className="vs-step__label">Company Info</span>
        </div>
      </div>

      {/* ── Step 1 ── */}
      {step === 1 && (
        <form onSubmit={handleNextStep} noValidate>
          <h1 className="auth-card__title">Vendor Registration</h1>
          <p  className="auth-card__subtitle">Tell us about yourself first.</p>

          {apiError && <div className="auth-alert auth-alert--error">{apiError}</div>}

          <div className="auth-row">
            <Field label="First Name" error={pErrors.firstName} required>
              <input
                className={`auth-input${pErrors.firstName ? ' has-error' : ''}`}
                type="text" autoComplete="given-name" placeholder="First name"
                value={personal.firstName}
                onChange={e => updatePersonal('firstName', e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Last Name" error={pErrors.lastName} required>
              <input
                className={`auth-input${pErrors.lastName ? ' has-error' : ''}`}
                type="text" autoComplete="family-name" placeholder="Last name"
                value={personal.lastName}
                onChange={e => updatePersonal('lastName', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Email Address" error={pErrors.email} required>
            <input
              className={`auth-input${pErrors.email ? ' has-error' : ''}`}
              type="email" autoComplete="email" placeholder="you@company.com"
              value={personal.email}
              onChange={e => updatePersonal('email', e.target.value)}
            />
          </Field>

          <Field label="Mobile Number" error={pErrors.phone} required>
            <div className="auth-input-wrap auth-phone-wrap">
              <span className="auth-phone-prefix">+91</span>
              <input
                className={`auth-input auth-input--phone${pErrors.phone ? ' has-error' : ''}`}
                type="tel" autoComplete="tel" inputMode="numeric"
                placeholder="10-digit mobile" maxLength={10}
                value={personal.phone}
                onChange={e => updatePersonal('phone', e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </Field>

          <Field label="Password" error={pErrors.password} required>
            <div className="auth-input-wrap">
              <input
                className={`auth-input auth-input--has-icon${pErrors.password ? ' has-error' : ''}`}
                type={showPw ? 'text' : 'password'} autoComplete="new-password"
                placeholder="Create a strong password"
                value={personal.password}
                onChange={e => updatePersonal('password', e.target.value)}
              />
              <button type="button" className="auth-input-icon" onClick={() => setShowPw(v => !v)}>
                {showPw ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <PasswordStrength password={personal.password} />
          </Field>

          <Field label="Confirm Password" error={pErrors.confirm} required>
            <div className="auth-input-wrap">
              <input
                className={`auth-input auth-input--has-icon${pErrors.confirm ? ' has-error' : ''}`}
                type={showCf ? 'text' : 'password'} autoComplete="new-password"
                placeholder="Repeat your password"
                value={personal.confirm}
                onChange={e => updatePersonal('confirm', e.target.value)}
              />
              <button type="button" className="auth-input-icon" onClick={() => setShowCf(v => !v)}>
                {showCf ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </Field>

          <button type="submit" className="auth-btn">
            Continue to Company Info →
          </button>

          <p className="auth-switch">
            Already have an account?{' '}
            <button type="button" onClick={() => onSwitch('login')}>Sign in</button>
          </p>
          <p className="auth-switch" style={{ marginTop: 6 }}>
            Registering as a customer?{' '}
            <button type="button" onClick={() => onSwitch('signup')}>Sign up here</button>
          </p>
        </form>
      )}

      {/* ── Step 2 ── */}
      {step === 2 && (
        <form onSubmit={handleSubmit} noValidate>
          <h1 className="auth-card__title">Company Details</h1>
          <p  className="auth-card__subtitle">Your business address for deliveries and verification.</p>

          {apiError && <div className="auth-alert auth-alert--error">{apiError}</div>}

          <Field label="Company Name" error={cErrors.companyName} required>
            <input
              className={`auth-input${cErrors.companyName ? ' has-error' : ''}`}
              type="text" placeholder="e.g. Aqua Pure Distributors"
              value={company.companyName}
              onChange={e => updateCompany('companyName', e.target.value)}
              autoFocus
            />
          </Field>

          <Field label="Street / Door No." error={cErrors.streetName} required>
            <input
              className={`auth-input${cErrors.streetName ? ' has-error' : ''}`}
              type="text" placeholder="Building, street name"
              value={company.streetName}
              onChange={e => updateCompany('streetName', e.target.value)}
            />
          </Field>

          <Field label="Area / Locality" error={cErrors.areaName} required>
            <input
              className={`auth-input${cErrors.areaName ? ' has-error' : ''}`}
              type="text" placeholder="Area or locality name"
              value={company.areaName}
              onChange={e => updateCompany('areaName', e.target.value)}
            />
          </Field>

          <div className="auth-row">
            <Field label="State" error={cErrors.stateId} required>
              <select
                className={`vs-select${cErrors.stateId ? ' has-error' : ''}`}
                value={company.stateId}
                onChange={e => updateCompany('stateId', e.target.value)}
              >
                <option value="">— Select state —</option>
                {states.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>

            <Field label="City" error={cErrors.cityId}>
              <select
                className="vs-select"
                value={company.cityId}
                onChange={e => updateCompany('cityId', e.target.value)}
                disabled={!company.stateId || citiesLoading}
              >
                <option value="">
                  {!company.stateId ? '— Select state first —' : citiesLoading ? 'Loading…' : cities.length === 0 ? '— No cities listed —' : '— Select city —'}
                </option>
                {cities.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Pincode" error={cErrors.pincode} required>
            <input
              className={`auth-input${cErrors.pincode ? ' has-error' : ''}`}
              type="text" inputMode="numeric" placeholder="6-digit pincode" maxLength={6}
              value={company.pincode}
              onChange={e => updateCompany('pincode', e.target.value.replace(/\D/g, ''))}
            />
          </Field>

          <div className="vs-actions">
            <button
              type="button"
              className="vs-back-btn"
              onClick={() => { setStep(1); setApiError('') }}
              disabled={loading}
            >
              ← Back
            </button>
            <button
              type="submit"
              className={`auth-btn vs-submit-btn${loading ? ' auth-btn--loading' : ''}`}
              disabled={loading}
            >
              {!loading && 'Register as Vendor'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
