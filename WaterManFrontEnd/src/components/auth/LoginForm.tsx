import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { login } from '../../utils/api'
import type { AuthMode, OtpPending } from '../../types'
import './auth.css'

interface LoginFormProps {
  onSwitch:  (mode: AuthMode) => void
  onOtp:     (data: OtpPending) => void
  onSuccess: () => void
}

interface FormState {
  identifier: string
  password:   string
}

interface FormErrors {
  identifier?: string
  password?:   string
}

export default function LoginForm({ onSwitch, onOtp, onSuccess }: LoginFormProps) {
  const { t } = useTranslation()

  const [form,     setForm]     = useState<FormState>({ identifier: '', password: '' })
  const [errors,   setErrors]   = useState<FormErrors>({})
  const [apiError, setApiError] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [showPw,   setShowPw]   = useState(false)

  function update(field: keyof FormState, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }))
    if (apiError) setApiError('')
  }

  function validate(): FormErrors {
    const errs: FormErrors = {}
    if (!form.identifier.trim()) errs.identifier = t('auth.errors.required')
    if (!form.password)          errs.password   = t('auth.errors.required')
    return errs
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    const result = await login(form.identifier, form.password)
    setLoading(false)

    if (result.success) {
      onSuccess()
      return
    }

    if (result.needsOtp) {
      onOtp({ userId: result.userId, phone: result.phone, devOtp: result.devOtp })
      return
    }

    setApiError(t(`auth.errors.${result.error}`))
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit} noValidate>
      <h1 className="auth-card__title">{t('auth.login.title')}</h1>
      <p  className="auth-card__subtitle">{t('auth.login.subtitle')}</p>

      {apiError && <div className="auth-alert auth-alert--error">{apiError}</div>}

      {/* Identifier */}
      <div className="auth-field">
        <label className="auth-label" htmlFor="login-id">
          {t('auth.login.identifier_label')}
        </label>
        <div className="auth-input-wrap">
          <input
            id="login-id"
            className={`auth-input${errors.identifier ? ' has-error' : ''}`}
            type="text"
            inputMode="email"
            autoComplete="username"
            placeholder={t('auth.login.identifier_placeholder')}
            value={form.identifier}
            onChange={e => update('identifier', e.target.value)}
          />
        </div>
        {errors.identifier && <span className="auth-field-error">⚠ {errors.identifier}</span>}
      </div>

      {/* Password */}
      <div className="auth-field">
        <div className="auth-label-row">
          <label className="auth-label" htmlFor="login-pw">
            {t('auth.login.password_label')}
          </label>
          <button type="button" className="auth-forgot-btn" onClick={() => onSwitch('forgot')}>
            {t('auth.login.forgot')}
          </button>
        </div>
        <div className="auth-input-wrap">
          <input
            id="login-pw"
            className={`auth-input auth-input--has-icon${errors.password ? ' has-error' : ''}`}
            type={showPw ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder={t('auth.login.password_placeholder')}
            value={form.password}
            onChange={e => update('password', e.target.value)}
          />
          <button
            type="button"
            className="auth-input-icon"
            onClick={() => setShowPw(v => !v)}
            aria-label={showPw ? t('auth.password.hide') : t('auth.password.show')}
          >
            {showPw ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {errors.password && <span className="auth-field-error">⚠ {errors.password}</span>}
      </div>

      <button
        type="submit"
        className={`auth-btn${loading ? ' auth-btn--loading' : ''}`}
        disabled={loading}
      >
        {!loading && t('auth.login.login_btn')}
      </button>

      <p className="auth-switch">
        {t('auth.login.no_account')}{' '}
        <button type="button" onClick={() => onSwitch('signup')}>
          {t('auth.login.signup_link')}
        </button>
      </p>
      <p className="auth-switch" style={{ marginTop: 6 }}>
        Are you a water vendor?{' '}
        <button type="button" onClick={() => onSwitch('vendor-signup')}>
          Register your business
        </button>
      </p>
      <p className="auth-switch" style={{ marginTop: 6 }}>
        Want to deliver water?{' '}
        <button type="button" onClick={() => onSwitch('delivery-signup')}>
          Register as a delivery partner
        </button>
      </p>
    </form>
  )
}

/* ── Icons ── */
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
