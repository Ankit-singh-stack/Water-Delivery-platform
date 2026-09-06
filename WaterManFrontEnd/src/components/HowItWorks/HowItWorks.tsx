import React from 'react'
import { useTranslation } from 'react-i18next'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import './HowItWorks.css'

interface Step {
  number:      string
  title:       string
  description: string
}

type IconComponent = () => React.ReactElement

const STEP_ICONS: IconComponent[] = [ClipboardIcon, CalendarIcon, TruckIcon, DropIcon]

export default function HowItWorks() {
  const { t } = useTranslation()
  const steps = t('how_it_works.steps', { returnObjects: true }) as Step[]
  const [headerRef, headerVisible] = useScrollReveal()
  const [stepsRef,  stepsVisible]  = useScrollReveal(0.05)

  return (
    <section className="hiw" id="how-it-works">
      <div className="hiw__wave-top" aria-hidden="true">
        <svg viewBox="0 0 1440 100" preserveAspectRatio="none">
          <path d="M0 55 C360 5 720 100 1080 55 C1280 32 1380 78 1440 68 L1440 0 L0 0 Z"
                fill="white"/>
        </svg>
      </div>

      <div className="hiw__bg" aria-hidden="true">
        <div className="hiw__orb" />
      </div>

      <div className="container hiw__inner">
        <div
          ref={headerRef}
          className={`hiw__header reveal${headerVisible ? ' visible' : ''}`}
        >
          <div className="section-tag section-tag--light">Simple Process</div>
          <h2 className="hiw__title">{t('how_it_works.title')}</h2>
          <p  className="hiw__subtitle">{t('how_it_works.subtitle')}</p>
        </div>

        <div ref={stepsRef} className="hiw__steps">
          <div className="hiw__connector" aria-hidden="true" />
          {steps.map((step, i) => {
            const Icon = STEP_ICONS[i]
            return (
              <div
                key={i}
                className={`hiw__step reveal${stepsVisible ? ' visible' : ''}`}
                style={{ transitionDelay: `${i * 120}ms` }}
              >
                <div className="hiw__step-num">{step.number}</div>
                <div className="hiw__step-card">
                  <div className="hiw__step-icon">
                    <Icon />
                  </div>
                  <h3 className="hiw__step-title">{step.title}</h3>
                  <p  className="hiw__step-desc">{step.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="hiw__wave-bottom" aria-hidden="true">
        <svg viewBox="0 0 1440 100" preserveAspectRatio="none">
          <path d="M0 45 C240 85 480 10 720 50 C960 90 1200 22 1440 55 L1440 100 L0 100 Z"
                fill="white"/>
        </svg>
      </div>
    </section>
  )
}

/* ── SVG icons ── */
function ClipboardIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <rect x="8" y="2" width="8" height="4" rx="1"/>
      <line x1="9" y1="12" x2="15" y2="12"/>
      <line x1="9" y1="16" x2="13" y2="16"/>
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8"  y1="2" x2="8"  y2="6"/>
      <line x1="3"  y1="10" x2="21" y2="10"/>
      <circle cx="8"  cy="15" r="0.8" fill="currentColor"/>
      <circle cx="12" cy="15" r="0.8" fill="currentColor"/>
      <circle cx="16" cy="15" r="0.8" fill="currentColor"/>
      <circle cx="8"  cy="18" r="0.8" fill="currentColor"/>
      <circle cx="12" cy="18" r="0.8" fill="currentColor"/>
    </svg>
  )
}

function TruckIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13"/>
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
      <circle cx="5.5"  cy="18.5" r="2.5"/>
      <circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  )
}

function DropIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C12 2 5 10 5 14.5C5 18.09 8.13 21 12 21C15.87 21 19 18.09 19 14.5C19 10 12 2 12 2Z"/>
      <path d="M9 16.5C9 14.5 10.5 13 12.5 12.5"/>
    </svg>
  )
}
