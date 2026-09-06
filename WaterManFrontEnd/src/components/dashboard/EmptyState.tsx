import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 px-6 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center mb-5">
        <Icon size={28} className="text-white/20" />
      </div>
      <h3 className="font-display font-semibold text-white/70 text-lg mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-white/35 max-w-xs mb-6">{description}</p>
      )}
      {action && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={action.onClick}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-blue via-brand-cyan to-brand-teal text-white font-semibold text-sm shadow-glow-cyan/30 hover:shadow-glow-cyan/50 transition-shadow"
        >
          {action.label}
        </motion.button>
      )}
    </motion.div>
  )
}
