import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { register } from '../../utils/api'
import PasswordStrength, { checkPasswordStrength } from './PasswordStrength'
import type { AuthMode, OtpPending } from '../../types'
import './auth.css'

interface SignupFormProps {
  onSwitch:  (mode: AuthMode) => void
  onOtp:     (data: OtpPending) => void
  onSuccess: () => void
}

interface FormState {
  firstName: string
  lastName:  string
  email:     string
  phone:     string
  password:  string
  confirm:   string
}

type FormErrors = Partial<Record<keyof FormState, string>>

const INITIAL: FormState = {
  firstName: '', lastName: '', email: '', phone: '', password: '', confirm: '',
}

export default function SignupForm({ onSwitch, onOtp, onSuccess }: SignupFormProps) {
  const { t } = useTranslation()

  const [form,     setForm]     = useState<FormState>(INITIAL)
  const [errors,   setErrors]   = useState<FormErrors>({})
  const [apiError, setApiError] = useState('')
  const [apiInfo,  setApiInfo]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [showPw,   setShowPw]   = useState(false)
  const [showCf,   setShowCf]   = useState(false)

  function update(field: keyof FormState, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }))
    if (apiError) setApiError('')
    if (apiInfo)  setApiInfo('')
  }

  function validate(): FormErrors {
    const errs: FormErrors = {}
    if (!form.firstName.trim())  errs.firstName = t('auth.errors.required')
    if (!form.lastName.trim())   errs.lastName  = t('auth.errors.required')

    if (!form.email.trim())      errs.email = t('auth.errors.required')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
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

    return errs
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    const result = await register({
      firstName: form.firstName,
      lastName:  form.lastName,
      email:     form.email,
      phone:     form.phone,
      password:  form.password,
    })
    setLoading(false)

    if (!result.success) {
      setApiError(t(`auth.errors.${result.error}`))
      return
    }

    if (!result.needsOtp) {
      onSuccess()
      return
    }

    if (result.message === 'account_unverified_resend') {
      setApiInfo(t('auth.errors.unverified'))
    }

    onOtp({ userId: result.userId, phone: result.phone, devOtp: result.devOtp })
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit} noValidate>
      <h1 className="auth-card__title">{t('auth.signup.title')}</h1>
      <p  className="auth-card__subtitle">{t('auth.signup.subtitle')}</p>

      {apiError && <div className="auth-alert auth-alert--error">{apiError}</div>}
      {apiInfo  && <div className="auth-alert auth-alert--info">{apiInfo}</div>}

      {/* Name row */}
      <div className="auth-row">
        <Field label={t('auth.signup.first_name_label')} error={errors.firstName}>
          <input
            className={`auth-input${errors.firstName ? ' has-error' : ''}`}
            type="text" autoComplete="given-name"
            placeholder={t('auth.signup.first_name_placeholder')}
            value={form.firstName}
            onChange={e => update('firstName', e.target.value)}
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

      <button
        type="submit"
        className={`auth-btn${loading ? ' auth-btn--loading' : ''}`}
        disabled={loading}
      >
        {!loading && t('auth.signup.create_btn')}
      </button>

      <p className="auth-switch">
        {t('auth.signup.have_account')}{' '}
        <button type="button" onClick={() => onSwitch('login')}>
          {t('auth.signup.login_link')}
        </button>
      </p>
      <p className="auth-switch" style={{ marginTop: 6 }}>
        Are you a water vendor?{' '}
        <button type="button" onClick={() => onSwitch('vendor-signup')}>
          Register your business
        </button>
      </p>
    </form>
  )
}

/* ── Reusable field wrapper ── */
interface FieldProps {
  label?:    string
  error?:    string
  children:  ReactNode
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
