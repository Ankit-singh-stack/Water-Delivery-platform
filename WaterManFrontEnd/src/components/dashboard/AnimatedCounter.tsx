import { useEffect } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'

interface AnimatedCounterProps {
  value: number
  duration?: number
  prefix?: string
  suffix?: string
  className?: string
}

export default function AnimatedCounter({ value, duration = 1.2, prefix = '', suffix = '', className = '' }: AnimatedCounterProps) {
  const count = useMotionValue(0)
  const rounded = useTransform(count, latest => Math.round(latest))
  const formatted = useTransform(rounded, latest => `${prefix}${latest.toLocaleString('en-IN')}${suffix}`)

  useEffect(() => {
    const controls = animate(count, value, { duration, ease: 'easeOut' })
    return controls.stop
  }, [count, value, duration])

  return <motion.span className={className} aria-live="polite">{formatted}</motion.span>
}
