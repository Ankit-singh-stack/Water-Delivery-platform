import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

interface StatsCardProps {
  label?: string
  title?: string
  value: string | number
  icon: LucideIcon
  trend?: string
  accent?: boolean
  gradient?: string
  delay?: number
}

export default function StatsCard({ label, title, value, icon: Icon, trend, accent, gradient, delay = 0 }: StatsCardProps) {
  const heading = title ?? label ?? ''
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className={`relative overflow-hidden rounded-2xl border p-5 ${
        gradient ? gradient :
        accent
          ? 'bg-gradient-to-br from-brand-blue/10 via-brand-cyan/10 to-brand-teal/10 border-brand-cyan/20 shadow-glow-cyan/20'
          : 'bg-white/[0.06] border-white/[0.08]'
      }`}
    >
      {gradient && (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-blue/30 via-brand-cyan/30 to-brand-teal/30 opacity-20" />
      )}
      {accent && (
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-brand-cyan/10 rounded-full blur-2xl" />
      )}
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">{heading}</p>
          <p className="text-2xl font-display font-bold text-white">{value}</p>
          {trend && (
            <p className="text-xs text-brand-teal mt-1 font-medium">{trend}</p>
          )}
        </div>
        <div className={`p-2.5 rounded-xl ${accent ? 'bg-brand-cyan/20' : 'bg-white/[0.06]'}`}>
          <Icon size={20} className={accent ? 'text-brand-cyan' : 'text-white/50'} />
        </div>
      </div>
    </motion.div>
  )
}
