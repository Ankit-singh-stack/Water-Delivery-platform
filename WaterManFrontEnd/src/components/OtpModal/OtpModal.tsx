import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import './OtpModal.css'

interface Props {
  phone:      string
  devOtp?:    string
  onVerify:   (code: string) => Promise<string | null>   // returns error or null
  onResend:   () => Promise<{ devOtp?: string; error?: string }>
  onClose:    () => void
}

const OTP_LEN = 6

export default function OtpModal({ phone, devOtp: initDevOtp, onVerify, onResend, onClose }: Props) {
  const { t }                = useTranslation()
  const [digits, setDigits]  = useState<string[]>(Array(OTP_LEN).fill(''))
  const [error, setError]    = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [devOtp, setDevOtp]  = useState(initDevOtp)
  const [countdown, setCountdown] = useState(60)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  function handleChange(idx: number, val: string) {
    const ch = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[idx] = ch
    setDigits(next)
    setError('')
    if (ch && idx < OTP_LEN - 1) inputRefs.current[idx + 1]?.focus()
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LEN)
    if (!pasted) return
    const next = [...digits]
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]
    setDigits(next)
    inputRefs.current[Math.min(pasted.length, OTP_LEN - 1)]?.focus()
  }

  async function handleVerify() {
    const code = digits.join('')
    if (code.length < OTP_LEN) { setError(t('auth.otp.error_incomplete')); return }
    setLoading(true)
    const err = await onVerify(code)
    setLoading(false)
    if (err) setError(t(`auth.errors.${err}`) || err)
  }

  async function handleResend() {
    setResending(true)
    const res = await onResend()
    setResending(false)
    if (res.error) { setError(res.error); return }
    if (res.devOtp) setDevOtp(res.devOtp)
    setCountdown(60)
    setDigits(Array(OTP_LEN).fill(''))
    inputRefs.current[0]?.focus()
  }

  const maskedPhone = phone.length > 4 ? `${phone.slice(0, 2)}XXXXXX${phone.slice(-2)}` : phone

  return (
    <div className="otp-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="otp-modal" role="dialog" aria-modal="true">
        <button className="otp-modal__close" onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>

        <div className="otp-modal__icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.18 2 2 0 0 1 3.61 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.09a16 16 0 0 0 6 6l.86-.86a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </div>

        <h2 className="otp-modal__title">{t('auth.otp.title')}</h2>
        <p className="otp-modal__subtitle">{t('auth.otp.subtitle')} <strong>{maskedPhone}</strong></p>

        {devOtp && (
          <div className="otp-modal__dev">
            {t('auth.otp.dev_notice')} <strong>{devOtp}</strong>
          </div>
        )}

        <div className="otp-modal__inputs" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              className={`otp-modal__box${error ? ' error' : ''}`}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              aria-label={`Digit ${i + 1}`}
            />
          ))}
        </div>

        {error && <p className="otp-modal__error">{error}</p>}

        <button className="otp-modal__verify" onClick={handleVerify} disabled={loading}>
          {loading ? <span className="spinner" /> : t('auth.otp.verify_btn')}
        </button>

        <div className="otp-modal__resend">
          {countdown > 0 ? (
            <span>{t('auth.otp.resend_in')} {countdown}s</span>
          ) : (
            <button onClick={handleResend} disabled={resending}>
              {resending ? '…' : t('auth.otp.resend')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
