import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { forgotPassword, resetPassword } from '../../utils/api'
import type { AuthMode } from '../../types'
import './auth.css'

interface ForgotPasswordProps {
  onSwitch: (mode: AuthMode) => void
}

export default function ForgotPassword({ onSwitch }: ForgotPasswordProps) {
  const { t } = useTranslation()

  const [identifier,  setIdentifier]  = useState('')
  const [error,       setError]       = useState('')
  const [sent,        setSent]        = useState(false)
  const [devToken,    setDevToken]    = useState<string | undefined>()
  const [loading,     setLoading]     = useState(false)

  // Reset form state
  const [token,       setToken]       = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [resetErr,    setResetErr]    = useState('')
  const [resetting,   setResetting]   = useState(false)
  const [done,        setDone]        = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!identifier.trim()) { setError(t('auth.errors.required')); return }
    setError('')
    setLoading(true)
    const result = await forgotPassword(identifier)
    setLoading(false)
    if (!result.success) { setError(t(`auth.errors.${result.error}`)); return }
    if (result.devToken) setDevToken(result.devToken)
    setSent(true)
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim())       { setResetErr('Reset token is required'); return }
    if (!newPassword)        { setResetErr('New password is required'); return }
    if (newPassword.length < 8) { setResetErr('Password must be at least 8 characters'); return }
    if (newPassword !== confirm) { setResetErr('Passwords do not match'); return }
    setResetErr('')
    setResetting(true)
    const res = await resetPassword(token.trim(), newPassword)
    setResetting(false)
    if (!res.success) {
      setResetErr(res.error === 'token_invalid' ? 'Reset token is invalid or expired.' : 'Failed to reset password. Please try again.')
      return
    }
    setDone(true)
  }

  if (done) return (
    <div className="auth-card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>✅</div>
      <h1 className="auth-card__title">Password Reset!</h1>
      <p className="auth-card__subtitle">Your password has been updated. You can now sign in.</p>
      <div className="auth-divider" />
      <button type="button" className="auth-btn" style={{ marginTop: 'var(--space-md)' }} onClick={() => onSwitch('login')}>
        Sign In
      </button>
    </div>
  )

  if (sent) return (
    <form className="auth-card" onSubmit={handleReset} noValidate>
      <h1 className="auth-card__title">Enter Reset Token</h1>
      <p className="auth-card__subtitle">
        {devToken
          ? 'Your reset token is shown below (dev mode only). In production this would be sent to your phone/email.'
          : 'Enter the reset token sent to your registered phone or email.'}
      </p>

      {devToken && (
        <div className="auth-alert" style={{ background: 'rgba(0,188,212,0.12)', borderColor: 'rgba(0,188,212,0.3)', color: 'var(--color-aqua)', marginBottom: 16, fontFamily: 'monospace', fontSize: '0.82rem', wordBreak: 'break-all' }}>
          Dev Token: {devToken}
        </div>
      )}

      {resetErr && <div className="auth-alert auth-alert--error">{resetErr}</div>}

      <div className="auth-field">
        <label className="auth-label">Reset Token</label>
        <input
          className="auth-input"
          type="text"
          placeholder="Paste your reset token"
          value={token}
          onChange={e => { setToken(e.target.value); setResetErr('') }}
        />
      </div>

      <div className="auth-field">
        <label className="auth-label">New Password</label>
        <input
          className={`auth-input${resetErr && !newPassword ? ' has-error' : ''}`}
          type="password"
          placeholder="Minimum 8 characters"
          value={newPassword}
          onChange={e => { setNewPassword(e.target.value); setResetErr('') }}
        />
      </div>

      <div className="auth-field">
        <label className="auth-label">Confirm Password</label>
        <input
          className={`auth-input${resetErr && confirm !== newPassword ? ' has-error' : ''}`}
          type="password"
          placeholder="Repeat new password"
          value={confirm}
          onChange={e => { setConfirm(e.target.value); setResetErr('') }}
        />
      </div>

      <button type="submit" className={`auth-btn${resetting ? ' auth-btn--loading' : ''}`} disabled={resetting}>
        {!resetting && 'Reset Password'}
      </button>

      <p className="auth-switch">
        <button type="button" onClick={() => onSwitch('login')}>← Back to Sign In</button>
      </p>
    </form>
  )

  return (
    <form className="auth-card" onSubmit={handleSubmit} noValidate>
      <h1 className="auth-card__title">{t('auth.forgot.title')}</h1>
      <p  className="auth-card__subtitle">{t('auth.forgot.subtitle')}</p>

      {error && <div className="auth-alert auth-alert--error">{error}</div>}

      <div className="auth-field">
        <label className="auth-label" htmlFor="forgot-id">
          {t('auth.forgot.identifier_label')}
        </label>
        <input
          id="forgot-id"
          className={`auth-input${error ? ' has-error' : ''}`}
          type="text"
          inputMode="email"
          placeholder={t('auth.forgot.identifier_placeholder')}
          value={identifier}
          onChange={e => { setIdentifier(e.target.value); setError('') }}
        />
      </div>

      <button type="submit" className={`auth-btn${loading ? ' auth-btn--loading' : ''}`} disabled={loading}>
        {!loading && t('auth.forgot.send_btn')}
      </button>

      <p className="auth-switch">
        <button type="button" onClick={() => onSwitch('login')}>
          ← {t('auth.forgot.back_login')}
        </button>
      </p>
    </form>
  )
}
