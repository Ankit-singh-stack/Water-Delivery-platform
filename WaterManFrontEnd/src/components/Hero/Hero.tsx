import { motion } from 'framer-motion'
import { Droplets, Truck, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.15, delayChildren: 0.1 },
  },
}

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: 'easeOut' as const } },
}

const scaleIn = {
  hidden: { opacity: 0, scale: 0.8 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.7, ease: 'easeOut' as const } },
}

export default function Hero() {
  const { t } = useTranslation()

  return (
    <section className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-brand-blue via-brand-purple to-brand-teal">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNiI+PHBhdGggZD0iTTM2IDM0djZIMzB2LTZoNnptMCAwaDNjMCAzIDAgMCAwIDB6Ii8+PC9nPjwvZz48L3N2Zz4=')]" aria-hidden="true" />

      {/* Gradient blobs */}
      <motion.div
        animate={{ y: [0, -30, 0], x: [0, 20, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -right-24 -top-24 h-[480px] w-[480px] rounded-full bg-brand-cyan/40 blur-3xl"
        aria-hidden="true"
      />
      <motion.div
        animate={{ y: [0, 30, 0], x: [0, -20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -bottom-32 -left-24 h-[520px] w-[520px] rounded-full bg-brand-purple/50 blur-3xl"
        aria-hidden="true"
      />
      <motion.div
        animate={{ y: [0, -20, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute left-1/3 top-1/4 h-[380px] w-[380px] rounded-full bg-brand-teal/40 blur-3xl"
        aria-hidden="true"
      />

      {/* Floating blobs (glass) */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <motion.div
          animate={{ y: [0, -25, 0], rotate: [0, 12, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute right-[22%] top-[18%] h-28 w-20 rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl"
        />
        <motion.div
          animate={{ y: [0, 20, 0], rotate: [0, -14, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-[20%] left-[12%] h-24 w-24 rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl"
        />
        <motion.div
          animate={{ y: [0, -18, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute left-[28%] top-[62%] h-16 w-16 rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl"
        />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-6 pb-16 pt-32 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">

          {/* ── Text column ── */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="text-center lg:text-left"
          >
            <motion.div
              variants={fadeUp}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur-md"
            >
              <span className="flex h-2 w-2 items-center justify-center">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
              </span>
              {t('hero.badge')}
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="font-display text-5xl font-black leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl"
            >
              <span className="block">{t('hero.tagline')}</span>
              <span className="mt-2 block bg-gradient-to-r from-white via-emerald-200 to-emerald-100 bg-clip-text text-transparent">
                {t('hero.tagline2')}
              </span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/80 lg:mx-0"
            >
              {t('hero.subtitle')}
            </motion.p>

            <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
              <a
                href="/order"
                className="group inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r from-white to-emerald-100 px-8 py-4 text-base font-bold text-brand-blue shadow-xl shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/30 active:scale-95"
              >
                <Droplets className="h-5 w-5" />
                {t('hero.cta_primary')}
                <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
              </a>
            </motion.div>

            {/* Stats */}
            <motion.div variants={fadeUp} className="mt-12 flex flex-wrap items-center justify-center gap-8 lg:justify-start">
              <StatItem value="50K+" label="Happy Families" />
              <div className="h-10 w-px bg-white/20" aria-hidden="true" />
              <StatItem value="100%" label="Pure Water" />
              <div className="h-10 w-px bg-white/20" aria-hidden="true" />
              <StatItem value="24/7" label="Support" />
            </motion.div>
          </motion.div>

          {/* ── Visual column ── */}
          <motion.div
            initial="hidden"
            animate="show"
            variants={containerVariants}
            className="relative hidden lg:block"
            aria-hidden="true"
          >
            <motion.div variants={scaleIn} className="mx-auto flex h-[460px] w-[300px] flex-col items-center justify-end"
              style={{ perspective: 1000 }}
            >
              {/* Bottle */}
              <motion.div
                animate={{ y: [0, -14, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                className="relative"
              >
                <div className="relative flex h-[420px] w-[220px] flex-col items-center justify-center rounded-[40px] border border-white/30 bg-gradient-to-b from-white/20 to-white/5 shadow-2xl shadow-black/30 backdrop-blur-md">
                  <div className="absolute inset-3 rounded-[30px] bg-gradient-to-b from-cyan-300/30 to-transparent" />
                  <Droplets className="h-24 w-24 text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.4)]" strokeWidth={1.2} />
                </div>
                {/* Ripples */}
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="absolute left-1/2 top-[92%] h-24 w-24 -translate-x-1/2 animate-ping rounded-full border-2 border-white/25"
                    style={{ animationDuration: '3s', animationDelay: `${i * 1}s` }}
                  />
                ))}
              </motion.div>
            </motion.div>
          </motion.div>

        </div>
      </div>

      {/* Wave divider */}
      <div className="relative z-10 mt-auto" aria-hidden="true">
        <svg viewBox="0 0 1440 130" preserveAspectRatio="none" className="block h-[100px] w-full">
          <path d="M0 65 C280 105 560 25 840 65 C1060 95 1260 35 1440 65 L1440 130 L0 130 Z" fill="#ffffff" />
        </svg>
      </div>
    </section>
  )
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 lg:items-start">
      <span className="font-display text-3xl font-extrabold text-white">{value}</span>
      <span className="text-xs font-semibold uppercase tracking-widest text-white/60">{label}</span>
    </div>
  )
}
