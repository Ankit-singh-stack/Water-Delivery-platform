import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { requestPasswordChange, confirmPasswordChange } from '../../../utils/api'
import OtpModal from '../../../components/OtpModal/OtpModal'

interface FormState {
  currentPassword: string
  newPassword:     string
  confirmPassword: string
}
type FormErrors = Partial<FormState>

function getStrength(pw: string): 'weak' | 'medium' | 'strong' {
  let s = 0
  if (pw.length >= 8) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  if (s <= 1) return 'weak'
  if (s <= 3) return 'medium'
  return 'strong'
}

export default function ChangePassword() {
  const { t } = useTranslation()
  const [form,    setForm]    = useState<FormState>({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [errors,  setErrors]  = useState<FormErrors>({})
  const [show,    setShow]    = useState({ current: false, new: false, confirm: false })
  const [saving,  setSaving]  = useState(false)
  const [alert,   setAlert]   = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [otpData, setOtpData] = useState<{ phone: string; devOtp?: string } | null>(null)

  const strength = form.newPassword ? getStrength(form.newPassword) : null

  function validate(): boolean {
    const errs: FormErrors = {}
    if (!form.currentPassword)  errs.currentPassword = t('auth.errors.required')
    if (!form.newPassword)       errs.newPassword     = t('auth.errors.required')
    else if (form.newPassword.length < 8) errs.newPassword = t('auth.password.conditions.length')
    if (form.newPassword !== form.confirmPassword) errs.confirmPassword = t('auth.errors.passwords_mismatch')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    const res = await requestPasswordChange(form.currentPassword)
    if (!res.success) {
      setSaving(false)
      const msg = res.error === 'invalid_current_password'
        ? t('profile.password.invalid_current')
        : res.error
      setAlert({ type: 'error', msg })
      return
    }

    if (!res.otpRequired) {
      const confirmRes = await confirmPasswordChange(form.newPassword)
      setSaving(false)
      if (!confirmRes.success) { setAlert({ type: 'error', msg: confirmRes.error }); return }
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setAlert({ type: 'success', msg: t('profile.password.changed') })
      return
    }

    setSaving(false)
    setOtpData({ phone: res.phone, devOtp: res.devOtp })
  }

  async function handleOtpVerify(code: string): Promise<string | null> {
    const res = await confirmPasswordChange(form.newPassword, code)
    if (!res.success) return res.error
    setOtpData(null)
    setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setAlert({ type: 'success', msg: t('profile.password.changed') })
    return null
  }

  async function handleOtpResend() {
    const res = await requestPasswordChange(form.currentPassword)
    if (!res.success) return { error: res.error }
    return { devOtp: res.devOtp }
  }

  function pwField(
    key: keyof FormState,
    label: string,
    showKey: 'current' | 'new' | 'confirm'
  ) {
    return (
      <div className="form-field form-field--full" style={{ marginBottom: 16 }}>
        <label className="form-label">{label} <span>*</span></label>
        <div style={{ position: 'relative' }}>
          <input
            className={`form-input${errors[key] ? ' form-input--error' : ''}`}
            type={show[showKey] ? 'text' : 'password'}
            value={form[key]}
            onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setErrors(err => ({ ...err, [key]: '' })) }}
            style={{ paddingRight: 48 }}
          />
          <button
            type="button"
            onClick={() => setShow(s => ({ ...s, [showKey]: !s[showKey] }))}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', fontWeight: 600,
            }}
          >
            {show[showKey] ? t('auth.password.hide') : t('auth.password.show')}
          </button>
        </div>
        {errors[key] && <span className="field-error">{errors[key]}</span>}
      </div>
    )
  }

  return (
    <>
      <div className="panel-card">
        <h2 className="panel__title">{t('profile.password.title')}</h2>
        <p className="panel__subtitle">{t('profile.password.subtitle')}</p>

        {alert && <div className={`alert alert--${alert.type}`}>{alert.msg}</div>}

        <div className="form-row">
          {pwField('currentPassword', t('profile.password.current_label'), 'current')}
          {pwField('newPassword',     t('profile.password.new_label'),     'new')}
        </div>

        {strength && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              {(['weak','medium','strong'] as const).map(lvl => (
                <div key={lvl} style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: strength === 'weak'   ? (lvl === 'weak'   ? '#EF9A9A' : 'rgba(255,255,255,0.1)') :
                              strength === 'medium' ? (lvl !== 'strong' ? '#FFCC80' : 'rgba(255,255,255,0.1)') :
                                                      '#81C784',
                  transition: 'background 0.2s',
                }} />
              ))}
            </div>
            <span style={{ fontSize: '0.75rem', color: strength === 'weak' ? '#EF9A9A' : strength === 'medium' ? '#FFCC80' : '#81C784' }}>
              {t(`auth.password.strength.${strength}`)}
            </span>
          </div>
        )}

        <div className="form-row">
          {pwField('confirmPassword', t('profile.password.confirm_label'), 'confirm')}
        </div>

        <div className="btn-row">
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? t('common.saving') : t('profile.password.change_btn')}
          </button>
        </div>
      </div>

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
