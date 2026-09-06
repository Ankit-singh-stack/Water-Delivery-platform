import { motion } from 'framer-motion'

interface SkeletonLoaderProps {
  count?: number
  variant?: 'card' | 'list' | 'stat'
  lines?: number
}

function SkeletonPulse({ className }: { className?: string }) {
  return (
    <motion.div
      animate={{ opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration: 1.5, repeat: Infinity }}
      className={`bg-white/[0.06] rounded-xl ${className ?? ''}`}
    />
  )
}

export default function SkeletonLoader({ count = 3, variant = 'card', lines = 0 }: SkeletonLoaderProps) {
  if (variant === 'stat') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white/[0.06] border border-white/[0.08] rounded-2xl p-5 space-y-3">
            <SkeletonPulse className="h-3 w-20" />
            <SkeletonPulse className="h-7 w-28" />
            <SkeletonPulse className="h-3 w-16" />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'list') {
    return (
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white/[0.06] border border-white/[0.08] rounded-2xl p-5 space-y-3">
            <div className="flex justify-between">
              <SkeletonPulse className="h-5 w-24" />
              <SkeletonPulse className="h-5 w-16 rounded-full" />
            </div>
            <SkeletonPulse className="h-4 w-full" />
            <SkeletonPulse className="h-4 w-3/4" />
            <div className="flex gap-2 pt-1">
              <SkeletonPulse className="h-8 w-20 rounded-lg" />
              <SkeletonPulse className="h-8 w-20 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white/[0.06] border border-white/[0.08] rounded-2xl p-5 space-y-3">
          <SkeletonPulse className="h-5 w-32" />
          <SkeletonPulse className="h-4 w-full" />
          <SkeletonPulse className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  )
}
