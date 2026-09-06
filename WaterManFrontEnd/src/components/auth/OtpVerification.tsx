import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { verifyOtp, resendOtp } from '../../utils/api'
import type { AuthMode, OtpPending } from '../../types'
import './OtpVerification.css'
import './auth.css'

const OTP_LENGTH  = 6
const RESEND_SECS = 30

interface OtpVerificationProps {
  pending:   OtpPending | null
  onSwitch:  (mode: AuthMode) => void
  onSuccess: () => void
}

export default function OtpVerification({ pending, onSwitch, onSuccess }: OtpVerificationProps) {
  const { t } = useTranslation()

  const [digits,  setDigits]  = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [timer,   setTimer]   = useState(RESEND_SECS)
  const [devOtp,  setDevOtp]  = useState(pending?.devOtp ?? '')
  const inputsRef             = useRef<(HTMLInputElement | null)[]>([])

  // Countdown
  useEffect(() => {
    if (timer === 0) return
    const id = setTimeout(() => setTimer(t => t - 1), 1000)
    return () => clearTimeout(id)
  }, [timer])

  // Auto-focus first box
  useEffect(() => { inputsRef.current[0]?.focus() }, [])

  function handleChange(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const val  = e.target.value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[idx]  = val
    setDigits(next)
    setError('')
    if (val && idx < OTP_LENGTH - 1) inputsRef.current[idx + 1]?.focus()
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      const next     = [...digits]
      next[idx - 1]  = ''
      setDigits(next)
      inputsRef.current[idx - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!paste) return
    const next = Array(OTP_LENGTH).fill('')
    paste.split('').forEach((ch, i) => { next[i] = ch })
    setDigits(next)
    inputsRef.current[Math.min(paste.length, OTP_LENGTH - 1)]?.focus()
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    const otp = digits.join('')
    if (otp.length < OTP_LENGTH) { setError(t('auth.errors.otp_invalid')); return }
    if (!pending) return

    setLoading(true)
    const result = await verifyOtp(pending.userId, otp)
    setLoading(false)

    if (!result.success) { setError(t(`auth.errors.${result.error}`)); return }

    setSuccess(true)
    setTimeout(onSuccess, 1200)
  }

  async function handleResend() {
    if (timer > 0 || !pending) return
    setDigits(Array(OTP_LENGTH).fill(''))
    setError('')

    const result = await resendOtp(pending.userId)
    if (result.success) {
      if (result.devOtp) setDevOtp(result.devOtp)
      setTimer(RESEND_SECS)
      inputsRef.current[0]?.focus()
    }
  }

  if (success) {
    return (
      <div className="auth-card otp-success">
        <div className="otp-success__icon">✓</div>
        <h2 className="auth-card__title">{t('auth.otp.success_title')}</h2>
        <p className="auth-card__subtitle">{t('auth.otp.success')}</p>
      </div>
    )
  }

  const maskedPhone = pending?.phone
    ? `${pending.phone.slice(0, 2)}${'•'.repeat(6)}${pending.phone.slice(-2)}`
    : ''

  return (
    <form className="auth-card" onSubmit={handleVerify} noValidate>
      <div className="otp-header">
        <div className="otp-phone-icon" aria-hidden="true">📱</div>
        <h1 className="auth-card__title">{t('auth.otp.title')}</h1>
        <p className="auth-card__subtitle">
          {t('auth.otp.subtitle')}{' '}
          <strong>+91 {maskedPhone}</strong>
        </p>
      </div>

      {devOtp && (
        <div className="dev-otp-notice">
          <span>🔧</span>
          <span>{t('auth.otp.dev_notice')} <strong>{devOtp}</strong></span>
        </div>
      )}

      {error && <div className="auth-alert auth-alert--error">{error}</div>}

      <div className="otp-inputs" role="group" aria-label="OTP input">
        {digits.map((digit, idx) => (
          <input
            key={idx}
            ref={el => { inputsRef.current[idx] = el }}
            className={`otp-box${digit ? ' otp-box--filled' : ''}${error ? ' otp-box--error' : ''}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            autoComplete="one-time-code"
            aria-label={`Digit ${idx + 1}`}
            onChange={e => handleChange(idx, e)}
            onKeyDown={e => handleKeyDown(idx, e)}
            onPaste={idx === 0 ? handlePaste : undefined}
          />
        ))}
      </div>

      <button
        type="submit"
        className={`auth-btn${loading ? ' auth-btn--loading' : ''}`}
        disabled={loading || digits.join('').length < OTP_LENGTH}
      >
        {!loading && t('auth.otp.verify_btn')}
      </button>

      <div className="otp-resend">
        {timer > 0 ? (
          <span>
            {t('auth.otp.resend_in')} <strong>{timer}s</strong>
          </span>
        ) : (
          <button type="button" className="otp-resend__btn" onClick={handleResend}>
            {t('auth.otp.resend')}
          </button>
        )}
      </div>

      <p className="auth-switch" style={{ marginTop: '8px' }}>
        <button type="button" onClick={() => onSwitch('login')}>
          ← {t('auth.forgot.back_login')}
        </button>
      </p>
    </form>
  )
}
