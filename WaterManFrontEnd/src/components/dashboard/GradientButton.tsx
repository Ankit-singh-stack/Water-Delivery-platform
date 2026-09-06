import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface GradientButtonProps {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  loading?: boolean
}

const VARIANTS = {
  primary: 'bg-gradient-to-r from-brand-blue via-brand-cyan to-brand-teal text-white shadow-glow-cyan/20 hover:shadow-glow-cyan/40',
  danger: 'bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25',
  ghost: 'bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.08]',
  outline: 'bg-transparent border border-brand-cyan/30 text-brand-cyan hover:bg-brand-cyan/10',
}

const SIZES = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3 text-sm rounded-xl',
}

export default function GradientButton({
  children,
  onClick,
  disabled = false,
  variant = 'primary',
  size = 'md',
  className = '',
  loading = false,
}: GradientButtonProps) {
  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.02 } : undefined}
      whileTap={!disabled ? { scale: 0.97 } : undefined}
      onClick={onClick}
      disabled={disabled || loading}
      className={`font-semibold transition-all duration-200 inline-flex items-center justify-center gap-2 ${
        disabled || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </motion.button>
  )
}
