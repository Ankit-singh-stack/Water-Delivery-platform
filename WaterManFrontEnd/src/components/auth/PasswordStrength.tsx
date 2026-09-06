import { useTranslation } from 'react-i18next'
import './PasswordStrength.css'

interface Condition {
  key:      string
  check:    (p: string) => boolean
  labelKey: string
}

export const CONDITIONS: Condition[] = [
  { key: 'length',  check: p => p.length >= 8,           labelKey: 'auth.password.conditions.length'  },
  { key: 'upper',   check: p => /[A-Z]/.test(p),         labelKey: 'auth.password.conditions.upper'   },
  { key: 'number',  check: p => /[0-9]/.test(p),         labelKey: 'auth.password.conditions.number'  },
  { key: 'special', check: p => /[^A-Za-z0-9]/.test(p), labelKey: 'auth.password.conditions.special' },
]

export type StrengthLevel = '' | 'weak' | 'medium' | 'strong'

export interface PasswordStrengthResult {
  score:   number
  level:   StrengthLevel
  results: boolean[]
}

export function checkPasswordStrength(password: string): PasswordStrengthResult {
  const results = CONDITIONS.map(c => c.check(password))
  const score   = results.filter(Boolean).length
  const level: StrengthLevel =
    score === 0 ? '' : score <= 1 ? 'weak' : score <= 3 ? 'medium' : 'strong'
  return { score, level, results }
}

interface PasswordStrengthProps {
  password: string
}

export default function PasswordStrength({ password }: PasswordStrengthProps) {
  const { t } = useTranslation()
  if (!password) return null

  const { score, level, results } = checkPasswordStrength(password)
  const levelLabel = level ? t(`auth.password.strength.${level}`) : ''

  return (
    <div className="pw-strength">
      {/* Strength bars */}
      <div className="pw-bars">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={`pw-bar${i <= score ? ` pw-bar--${level}` : ''}`}
          />
        ))}
        {levelLabel && (
          <span className={`pw-level pw-level--${level}`}>{levelLabel}</span>
        )}
      </div>

      {/* Condition checklist */}
      <ul className="pw-conditions">
        {CONDITIONS.map((cond, i) => (
          <li key={cond.key} className={`pw-cond${results[i] ? ' pw-cond--met' : ''}`}>
            <span className="pw-cond__icon" aria-hidden="true">
              {results[i] ? '✓' : '○'}
            </span>
            {t(cond.labelKey)}
          </li>
        ))}
      </ul>
    </div>
  )
}
