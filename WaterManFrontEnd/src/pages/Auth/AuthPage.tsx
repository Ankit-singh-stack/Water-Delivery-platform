import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNav } from '../../context/NavigationContext'
import { useFontSize } from '../../context/FontSizeContext'
import LoginForm        from '../../components/auth/LoginForm'
import SignupForm       from '../../components/auth/SignupForm'
import OtpVerification  from '../../components/auth/OtpVerification'
import ForgotPassword   from '../../components/auth/ForgotPassword'
import VendorSignupForm from '../../components/auth/VendorSignupForm'
import DeliveryPartnerSignupForm from '../../components/auth/DeliveryPartnerSignupForm'
import type { AuthMode, OtpPending, FontSizeKey } from '../../types'
import './AuthPage.css'

interface Language {
  code:        string
  label:       string
  nativeLabel: string
}

const LANGUAGES: Language[] = [
  { code: 'en', label: 'EN', nativeLabel: 'English' },
  { code: 'te', label: 'తె', nativeLabel: 'తెలుగు'  },
  { code: 'ta', label: 'த',  nativeLabel: 'தமிழ்'   },
]

interface AuthPageProps {
  defaultMode?: AuthMode
}

export default function AuthPage({ defaultMode = 'login' }: AuthPageProps) {
  const { navigate }          = useNav()
  const [mode, setMode]       = useState<AuthMode>(defaultMode)
  const [pending, setPending] = useState<OtpPending | null>(null)

  function goOtp(data: OtpPending) { setPending(data); setMode('otp') }
  function onAuthSuccess() { navigate('home') }

  return (
    <div className="auth-page">
      <div className="auth-body">

        {/* ── Left decorative panel ── */}
        <aside className="auth-left">
          <div className="auth-left__bg" />
          <div className="auth-left__content">

            {/* Top bar: brand + controls */}
            <div className="auth-left__topbar">
              <button className="auth-brand" onClick={() => navigate('home')}>
                <WaterDropSVG />
                <span className="auth-brand__name">TankerDrop</span>
              </button>
              <div className="auth-left__controls">
                <FontSizeToggle />
                <LangSelector />
              </div>
            </div>

            {/* Center illustration */}
            <div className="auth-left__illustration">
              <LargeDropSVG />
              <div className="auth-drop-ripple auth-drop-ripple--1" />
              <div className="auth-drop-ripple auth-drop-ripple--2" />
              <div className="auth-drop-ripple auth-drop-ripple--3" />
            </div>

            {/* Tagline */}
            <p className="auth-left__tagline">
              Pure water, delivered by truck<br />straight to your doorstep.
            </p>

            {/* Trust stats */}
            <div className="auth-left__stats">
              <div className="auth-stat">
                <span className="auth-stat__val">50K+</span>
                <span className="auth-stat__lbl">Families</span>
              </div>
              <div className="auth-stat__sep" />
              <div className="auth-stat">
                <span className="auth-stat__val">100%</span>
                <span className="auth-stat__lbl">Pure</span>
              </div>
              <div className="auth-stat__sep" />
              <div className="auth-stat">
                <span className="auth-stat__val">24/7</span>
                <span className="auth-stat__lbl">Support</span>
              </div>
            </div>

          </div>
        </aside>

        {/* ── Right form panel ── */}
        <main className="auth-right">
          <div className="auth-form-wrap">
            {mode === 'login'         && <LoginForm        onSwitch={setMode} onOtp={goOtp} onSuccess={onAuthSuccess} />}
            {mode === 'signup'        && <SignupForm        onSwitch={setMode} onOtp={goOtp} onSuccess={onAuthSuccess} />}
            {mode === 'vendor-signup' && <VendorSignupForm  onSwitch={setMode} onOtp={goOtp} onSuccess={onAuthSuccess} />}
            {mode === 'delivery-signup' && <DeliveryPartnerSignupForm onSwitch={setMode} onOtp={goOtp} onSuccess={onAuthSuccess} />}
            {mode === 'otp'           && <OtpVerification  pending={pending}  onSwitch={setMode} onSuccess={onAuthSuccess} />}
            {mode === 'forgot'        && <ForgotPassword   onSwitch={setMode} />}
          </div>
        </main>

      </div>
    </div>
  )
}

/* ── Font size toggle ── */
interface FontButton {
  key:   FontSizeKey
  label: string
  sup:   string
  aria:  string
}

const FONT_BUTTONS: FontButton[] = [
  { key: 'small',  label: 'A', sup: '−', aria: 'Small text'  },
  { key: 'medium', label: 'A', sup: '',  aria: 'Medium text' },
  { key: 'large',  label: 'A', sup: '+', aria: 'Large text'  },
]

function FontSizeToggle() {
  const { fontSize, setFontSize } = useFontSize()
  return (
    <div className="al-font-ctrl">
      {FONT_BUTTONS.map(({ key, label, sup, aria }) => (
        <button
          key={key}
          className={`al-font-btn al-font-btn--${key}${fontSize === key ? ' active' : ''}`}
          onClick={() => setFontSize(key)}
          aria-label={aria}
        >
          {label}{sup && <sup>{sup}</sup>}
        </button>
      ))}
    </div>
  )
}

/* ── Language selector ── */
function LangSelector() {
  const { i18n }        = useTranslation()
  const [open, setOpen] = useState(false)
  const ref             = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = LANGUAGES.find(l => l.code === i18n.language) ?? LANGUAGES[0]

  return (
    <div className="al-lang" ref={ref}>
      <button
        className="al-lang__btn"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label="Select language"
      >
        <span>{current.label}</span>
        <svg
          className={`al-lang__chevron${open ? ' open' : ''}`}
          width="10" height="6" viewBox="0 0 10 6"
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6"
                fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div className="al-lang__menu">
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              className={`al-lang__opt${i18n.language === lang.code ? ' active' : ''}`}
              onClick={() => { i18n.changeLanguage(lang.code); setOpen(false) }}
            >
              <span className="al-lang__code">{lang.label}</span>
              <span className="al-lang__name">{lang.nativeLabel}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── SVGs ── */
function WaterDropSVG() {
  return (
    <svg width="28" height="36" viewBox="0 0 34 44" fill="none">
      <path d="M17 2C17 2 32 18 32 28C32 36.84 25.28 44 17 44C8.72 44 2 36.84 2 28C2 18 17 2 17 2Z"
            fill="url(#apDrop)"/>
      <path d="M9.5 30.5C9.5 25 13 21.5 18 20" stroke="rgba(255,255,255,0.45)"
            strokeWidth="2.2" strokeLinecap="round"/>
      <defs>
        <linearGradient id="apDrop" x1="6" y1="4" x2="30" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%"  stopColor="#4DD0E1"/>
          <stop offset="100%" stopColor="#006064"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function LargeDropSVG() {
  return (
    <svg width="160" height="200" viewBox="0 0 160 200" fill="none">
      <path d="M80 8C80 8 148 80 148 124C148 164.8 117.6 198 80 198C42.4 198 12 164.8 12 124C12 80 80 8 80 8Z"
            fill="url(#lgDrop)" opacity="0.9"/>
      <path d="M48 80C48 80 36 100 36 118" stroke="rgba(255,255,255,0.3)"
            strokeWidth="8" strokeLinecap="round"/>
      <circle cx="60"  cy="150" r="6"   fill="rgba(255,255,255,0.18)"/>
      <circle cx="95"  cy="165" r="4"   fill="rgba(255,255,255,0.14)"/>
      <circle cx="75"  cy="175" r="7.5" fill="rgba(255,255,255,0.12)"/>
      <defs>
        <linearGradient id="lgDrop" x1="30" y1="10" x2="140" y2="190" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#80DEEA"/>
          <stop offset="55%"  stopColor="#0097A7"/>
          <stop offset="100%" stopColor="#004D40"/>
        </linearGradient>
      </defs>
    </svg>
  )
}
