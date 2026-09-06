import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { submitSupportTicket } from '../../../utils/api'

const SUBJECTS = [
  'Delivery Issue',
  'Order Problem',
  'Payment Problem',
  'Address Issue',
  'Account Issue',
  'Other',
]

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How do I place a water order?',
    a: 'After logging in, go to your home page and click "Order Now". Choose your delivery address, quantity, and preferred date. Confirm the order and you will receive an OTP-verified confirmation.',
  },
  {
    q: 'When will my order be delivered?',
    a: 'Deliveries are typically completed within 2–6 hours of order confirmation during business hours (7 AM – 8 PM). You will receive an SMS notification when the delivery is on the way.',
  },
  {
    q: 'How do I change my delivery address?',
    a: 'Go to My Profile → My Addresses to add, edit, or delete delivery addresses. When placing an order, you can select any saved address. Note: changing an address after an order is placed may not take effect for that order.',
  },
  {
    q: 'What payment methods are accepted?',
    a: 'We accept UPI, debit/credit cards, net banking, and popular wallets. Cash on delivery is also available in select areas. Payment is collected at the time of delivery.',
  },
  {
    q: 'How do I cancel or modify an order?',
    a: 'Orders can be cancelled or modified within 30 minutes of placement. Go to My Profile → My Orders, find your order, and click "Cancel". After 30 minutes, please contact support.',
  },
  {
    q: 'Who do I contact for urgent delivery issues?',
    a: 'For urgent issues, use the "Contact Support" form below with subject "Delivery Issue". Our support team typically responds within 30 minutes during business hours. For emergencies, call our helpline.',
  },
]

export default function HelpSupport() {
  const { t } = useTranslation()
  const [openFaq,  setOpenFaq]  = useState<number | null>(null)
  const [subject,  setSubject]  = useState('')
  const [message,  setMessage]  = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [errors, setErrors] = useState<{ subject?: string; message?: string }>({})

  function validate() {
    const errs: typeof errors = {}
    if (!subject) errs.subject = t('auth.errors.required')
    if (!message.trim()) errs.message = t('auth.errors.required')
    else if (message.trim().length < 20) errs.message = t('profile.help.message_min')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSubmitting(true)
    const res = await submitSupportTicket(subject, message)
    setSubmitting(false)
    if (res.success) {
      setAlert({ type: 'success', msg: t('profile.help.ticket_sent') })
      setSubject('')
      setMessage('')
    } else {
      setAlert({ type: 'error', msg: res.error })
    }
  }

  return (
    <>
      {/* Quick actions */}
      <div className="panel-card">
        <h2 className="panel__title">{t('profile.help.title')}</h2>
        <p className="panel__subtitle">{t('profile.help.subtitle')}</p>

        <div className="help-quick-actions">
          <div className="help-action-card">
            <div className="help-action-card__icon" style={{ background: 'rgba(129,199,132,0.15)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#81C784" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="15" height="13" rx="1"/>
                <path d="M16 8h4l3 5v3h-7V8z"/>
                <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
              </svg>
            </div>
            <div className="help-action-card__label">{t('profile.help.action_track')}</div>
            <div className="help-action-card__desc">{t('profile.help.action_track_desc')}</div>
          </div>
          <div className="help-action-card">
            <div className="help-action-card__icon" style={{ background: 'rgba(239,154,154,0.15)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF9A9A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div className="help-action-card__label">{t('profile.help.action_report')}</div>
            <div className="help-action-card__desc">{t('profile.help.action_report_desc')}</div>
          </div>
          <div className="help-action-card">
            <div className="help-action-card__icon" style={{ background: 'rgba(0,188,212,0.12)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4DD0E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.18 2 2 0 0 1 3.61 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.09a16 16 0 0 0 6 6l.86-.86a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </div>
            <div className="help-action-card__label">{t('profile.help.action_call')}</div>
            <div className="help-action-card__desc">{t('profile.help.action_call_desc')}</div>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="panel-card">
        <h3 className="panel__title" style={{ fontSize: '1rem' }}>{t('profile.help.faq_title')}</h3>
        <p className="panel__subtitle">{t('profile.help.faq_subtitle')}</p>

        <div className="faq-list">
          {FAQS.map((faq, i) => (
            <div key={i} className={`faq-item${openFaq === i ? ' open' : ''}`}>
              <button className="faq-question" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                <span>{faq.q}</span>
                <ChevronIcon open={openFaq === i} />
              </button>
              {openFaq === i && <p className="faq-answer">{faq.a}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Contact support form */}
      <div className="panel-card">
        <h3 className="panel__title" style={{ fontSize: '1rem' }}>{t('profile.help.contact_title')}</h3>
        <p className="panel__subtitle">{t('profile.help.contact_subtitle')}</p>

        {alert && <div className={`alert alert--${alert.type}`}>{alert.msg}</div>}

        <div className="form-field form-field--full" style={{ marginBottom: 16 }}>
          <label className="form-label">{t('profile.help.subject')} <span>*</span></label>
          <select
            className={`form-input${errors.subject ? ' form-input--error' : ''}`}
            value={subject}
            onChange={e => { setSubject(e.target.value); setErrors(err => ({ ...err, subject: '' })) }}
            style={{ cursor: 'pointer' }}
          >
            <option value="">{t('profile.help.subject_placeholder')}</option>
            {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {errors.subject && <span className="field-error">{errors.subject}</span>}
        </div>

        <div className="form-field form-field--full" style={{ marginBottom: 20 }}>
          <label className="form-label">{t('profile.help.message')} <span>*</span></label>
          <textarea
            className={`form-input${errors.message ? ' form-input--error' : ''}`}
            rows={5}
            value={message}
            placeholder={t('profile.help.message_placeholder')}
            onChange={e => { setMessage(e.target.value); setErrors(err => ({ ...err, message: '' })) }}
            style={{ resize: 'vertical' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {errors.message
              ? <span className="field-error">{errors.message}</span>
              : <span />}
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
              {message.length} / 1000
            </span>
          </div>
        </div>

        <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? t('common.saving') : t('profile.help.submit_btn')}
        </button>
      </div>
    </>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
         style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}
