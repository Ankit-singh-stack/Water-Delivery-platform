import { motion } from 'framer-motion'
import { Truck, Droplets, Clock, Leaf, CalendarCheck, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface FeatureItem {
  icon:        string
  title:       string
  description: string
}

const ICONS = [Truck, Droplets, Clock, Leaf, CalendarCheck, Sparkles]

export default function Features() {
  const { t } = useTranslation()
  const items = t('features.items', { returnObjects: true }) as FeatureItem[]

  return (
    <section id="features" className="relative overflow-hidden bg-white py-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.06),transparent_70%)]" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-16 max-w-2xl text-center"
        >
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-blue/20 bg-brand-blue/5 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-brand-blue">
            <Sparkles className="h-3.5 w-3.5" />
            Our Advantages
          </span>
          <h2 className="font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            {t('features.title')}
          </h2>
          <p className="mt-4 text-lg text-ink-muted">{t('features.subtitle')}</p>
        </motion.div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => {
            const Icon = ICONS[i % ICONS.length]
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: (i % 3) * 0.12 }}
                whileHover={{ y: -8 }}
                className="group relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-8 shadow-lg shadow-slate-200/50 transition-all duration-300 hover:border-brand-blue/30 hover:shadow-2xl hover:shadow-brand-blue/10"
              >
                {/* Hover gradient glow */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-blue/5 via-transparent to-brand-teal/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden="true" />

                <div className="relative mb-6 inline-grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-blue/10 to-brand-teal/10 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 group-hover:from-brand-blue group-hover:to-brand-teal">
                  <Icon className="h-8 w-8 text-brand-blue transition-colors duration-300 group-hover:text-white" strokeWidth={1.8} />
                </div>

                <h3 className="relative mb-3 font-display text-xl font-bold text-ink">{item.title}</h3>
                <p className="relative text-[0.95rem] leading-relaxed text-ink-muted">{item.description}</p>

                <div className="absolute bottom-0 left-[15%] right-[15%] h-1 origin-left scale-x-0 rounded-full bg-gradient-to-r from-brand-blue via-brand-purple to-brand-teal transition-transform duration-300 group-hover:scale-x-100" aria-hidden="true" />
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
