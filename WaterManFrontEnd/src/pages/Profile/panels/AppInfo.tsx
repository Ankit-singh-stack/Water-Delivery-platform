import { useState } from 'react'
import { getSession } from '../../../utils/api'

type InfoTab = 'about' | 'terms' | 'privacy' | 'refer'

const TABS: { key: InfoTab; label: string }[] = [
  { key: 'about',   label: 'About'          },
  { key: 'terms',   label: 'Terms of Use'   },
  { key: 'privacy', label: 'Privacy Policy' },
  { key: 'refer',   label: 'Refer & Earn'   },
]

export default function AppInfo() {
  const [tab, setTab] = useState<InfoTab>('about')

  return (
    <div className="appinfo">
      <div className="appinfo__tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`appinfo__tab${tab === t.key ? ' appinfo__tab--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="appinfo__body">
        {tab === 'about'   && <AboutSection />}
        {tab === 'terms'   && <TermsSection />}
        {tab === 'privacy' && <PrivacySection />}
        {tab === 'refer'   && <ReferSection />}
      </div>
    </div>
  )
}

function AboutSection() {
  return (
    <div className="appinfo__section">
      <div className="appinfo__logo-wrap">
        <svg width="48" height="60" viewBox="0 0 34 44" fill="none">
          <path d="M17 2C17 2 32 18 32 28C32 36.84 25.28 44 17 44C8.72 44 2 36.84 2 28C2 18 17 2 17 2Z"
                fill="url(#aDrop)" />
          <path d="M9.5 30.5C9.5 25 13 21.5 18 20" stroke="rgba(255,255,255,0.45)"
                strokeWidth="2.2" strokeLinecap="round"/>
          <defs>
            <linearGradient id="aDrop" x1="6" y1="4" x2="30" y2="42" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#4DD0E1"/>
              <stop offset="100%" stopColor="#006064"/>
            </linearGradient>
          </defs>
        </svg>
        <div>
          <div className="appinfo__app-name">TankerDrop</div>
          <div className="appinfo__version">Version 1.0.0</div>
        </div>
      </div>

      <p className="appinfo__p">
        TankerDrop is a platform connecting households and businesses with trusted water tanker suppliers
        for fast, reliable delivery right to your doorstep.
      </p>
      <p className="appinfo__p">
        Whether you need water for daily use, construction, or emergencies, TankerDrop helps you order
        in minutes and track delivery in real time.
      </p>

      <div className="appinfo__features">
        {[
          { icon: '⚡', text: 'ASAP & scheduled delivery' },
          { icon: '📍', text: 'Real-time order tracking'  },
          { icon: '🔒', text: 'Secure online payments'    },
          { icon: '⭐', text: 'Verified vendors'          },
        ].map(f => (
          <div key={f.icon} className="appinfo__feature">
            <span className="appinfo__feature-icon">{f.icon}</span>
            <span>{f.text}</span>
          </div>
        ))}
      </div>

      <div className="appinfo__contact">
        <div className="appinfo__contact-title">Contact Us</div>
        <div className="appinfo__contact-row">📧 support@tankerdrop.in</div>
        <div className="appinfo__contact-row">📞 1800-XXX-XXXX (Mon–Sat, 9 AM–6 PM)</div>
      </div>
    </div>
  )
}

function TermsSection() {
  return (
    <div className="appinfo__section">
      <h3 className="appinfo__heading">Terms of Use</h3>
      <p className="appinfo__meta">Last updated: January 2025</p>

      {[
        {
          title: '1. Acceptance of Terms',
          body:  'By accessing or using TankerDrop, you agree to be bound by these Terms of Use. If you do not agree, please do not use the platform.',
        },
        {
          title: '2. Services',
          body:  'TankerDrop facilitates the booking of water tanker delivery services. We act as an intermediary between customers and independent vendors. Delivery times are estimates and may vary based on traffic, weather, and vendor availability.',
        },
        {
          title: '3. User Responsibilities',
          body:  'You are responsible for providing accurate delivery information, ensuring access to the delivery location, and making timely payment. Misuse of the platform, including fraudulent orders or abusive behaviour toward vendors, may result in account suspension.',
        },
        {
          title: '4. Payments',
          body:  'Payments are processed securely via Razorpay. Cash on delivery is available for eligible orders. Refunds for cancelled or undelivered orders will be processed within 5–7 business days.',
        },
        {
          title: '5. Cancellation Policy',
          body:  'Orders can be cancelled before a vendor accepts them. Once accepted, cancellations are subject to approval. Repeated last-minute cancellations may affect your account standing.',
        },
        {
          title: '6. Limitation of Liability',
          body:  'TankerDrop is not liable for delays, losses, or damages arising from factors beyond our control, including but not limited to vendor errors, natural events, or network outages.',
        },
        {
          title: '7. Governing Law',
          body:  'These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in Hyderabad, Telangana.',
        },
      ].map(s => (
        <div key={s.title} className="appinfo__clause">
          <div className="appinfo__clause-title">{s.title}</div>
          <p className="appinfo__p">{s.body}</p>
        </div>
      ))}
    </div>
  )
}

function PrivacySection() {
  return (
    <div className="appinfo__section">
      <h3 className="appinfo__heading">Privacy Policy</h3>
      <p className="appinfo__meta">Last updated: January 2025</p>

      {[
        {
          title: '1. Information We Collect',
          body:  'We collect information you provide when registering (name, phone, email), placing orders (delivery address), and using the app. We also collect device and usage data to improve our service.',
        },
        {
          title: '2. How We Use Your Information',
          body:  'Your information is used to process and fulfill orders, send order status notifications, provide customer support, and improve the platform. We do not sell your personal data to third parties.',
        },
        {
          title: '3. Data Sharing',
          body:  'Order details (name, phone, address) are shared with the assigned vendor solely to fulfil your delivery. Payment information is handled securely by Razorpay and is not stored on our servers.',
        },
        {
          title: '4. Data Security',
          body:  'We implement industry-standard security measures to protect your data. All communication between your device and our servers is encrypted via HTTPS.',
        },
        {
          title: '5. Your Rights',
          body:  'You may request access to, correction of, or deletion of your personal data by contacting support@tankerdrop.in. Account deletion will remove your profile and order history within 30 days.',
        },
        {
          title: '6. Cookies',
          body:  'The web app uses local storage to keep you signed in. We do not use third-party tracking cookies.',
        },
        {
          title: '7. Contact',
          body:  'For privacy-related queries, contact our Data Protection Officer at privacy@tankerdrop.in.',
        },
      ].map(s => (
        <div key={s.title} className="appinfo__clause">
          <div className="appinfo__clause-title">{s.title}</div>
          <p className="appinfo__p">{s.body}</p>
        </div>
      ))}
    </div>
  )
}

function ReferSection() {
  const session = getSession()
  const code = session ? `WM${session.name.replace(/\s/g, '').toUpperCase().slice(0, 5)}${session.userId.slice(-4).toUpperCase()}` : 'WMXXXXXX'
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="appinfo__section">
      <div className="refer__hero">
        <div className="refer__icon">🎁</div>
        <h3 className="refer__title">Refer & Earn</h3>
        <p className="refer__sub">Invite friends and earn ₹50 for every friend who places their first order.</p>
      </div>

      <div className="refer__code-card">
        <div className="refer__code-label">Your Referral Code</div>
        <div className="refer__code">{code}</div>
        <button className="refer__copy-btn" onClick={handleCopy}>
          {copied ? '✓ Copied!' : 'Copy Code'}
        </button>
      </div>

      <div className="refer__steps">
        {[
          { step: '1', text: 'Share your referral code with friends'          },
          { step: '2', text: 'They sign up on TankerDrop using your code'       },
          { step: '3', text: 'They place their first order'                   },
          { step: '4', text: 'You both earn ₹50 wallet credit automatically' },
        ].map(s => (
          <div key={s.step} className="refer__step">
            <span className="refer__step-num">{s.step}</span>
            <span className="refer__step-text">{s.text}</span>
          </div>
        ))}
      </div>

      <div className="refer__tnc">
        Referral credit is applied to your wallet after the referred user's first order is delivered.
        Maximum ₹500 in referral earnings per calendar month. Terms apply.
      </div>
    </div>
  )
}
