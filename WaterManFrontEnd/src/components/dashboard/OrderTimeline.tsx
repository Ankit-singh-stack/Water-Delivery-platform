import { motion } from 'framer-motion'
import { Check } from 'lucide-react'

interface Step {
  label: string
  status: string
}

interface OrderTimelineProps {
  steps: Step[]
  currentStatus: string
}

export default function OrderTimeline({ steps, currentStatus }: OrderTimelineProps) {
  const currentIdx = steps.findIndex(s => s.status === currentStatus)

  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-2">
      {steps.map((step, i) => {
        const done = i <= currentIdx
        const current = i === currentIdx
        return (
          <div key={step.status} className="flex items-center">
            <div className="flex flex-col items-center">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: current ? 1.1 : 1 }}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  done
                    ? 'bg-gradient-to-br from-brand-cyan to-brand-teal text-white shadow-glow-cyan'
                    : 'border border-white/20 bg-white/[0.06] text-white/30'
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </motion.div>
              <span className={`mt-2 whitespace-nowrap font-body text-[10px] font-medium ${
                done ? 'text-white/80' : 'text-white/30'
              }`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`mx-1 h-0.5 w-8 sm:w-12 ${
                i < currentIdx ? 'bg-gradient-to-r from-brand-cyan to-brand-teal' : 'bg-white/10'
              }`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
