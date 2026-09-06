import { motion } from 'framer-motion'
import { Droplets, Mail, Phone, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNav } from '../../context/NavigationContext'

const SOCIALS = [
  { label: 'Facebook',  icon: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /> },
  { label: 'Twitter',   icon: <path d="M22 4.01c-1 .49-1.98.82-3 1-1.94-1.92-5.01-1.76-6.77.31a4.5 4.5 0 0 0 1.06 6.77C11 12.6 8.6 13.6 6 16c-.4.5-.7 1.5-1 3 3-1 6-1 8-2 .94-.48 1.76-1.04 2.5-1.66a4.5 4.5 0 0 0 4.16-5.6c.96-.95 1.42-2.18 2.34-3.31z" /> },
  { label: 'Instagram', icon: <><rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></> },
  { label: 'YouTube',   icon: <><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.5 8.6.5 8.6.5s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.37z" /><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" /></> },
]

const COMPANY_LINKS = [
  { label: 'About Us',     href: '#' },
  { label: 'Careers',      href: '#' },
  { label: 'Press',        href: '#' },
  { label: 'Contact',      href: '#' },
]

const RESOURCE_LINKS = [
  { page: 'order',    label: 'Order Water'    },
  { page: 'tracking', label: 'Track Order'    },
  { page: 'profile',  label: 'My Profile'     },
] as const

const LEGAL_LINKS = [
  { label: 'Terms of Use',   href: '#' },
  { label: 'Privacy Policy', href: '#' },
  { label: 'Refund Policy',  href: '#' },
]

export default function Footer() {
  const { t } = useTranslation()
  const { navigate } = useNav()

  return (
    <footer className="relative">
      {/* Gradient top border */}
      <div className="h-1 w-full bg-gradient-to-r from-brand-blue via-brand-purple to-brand-teal" aria-hidden="true" />

      <div className="bg-slate-950 text-slate-300">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-4">

            {/* Brand */}
            <div className="lg:col-span-1">
              <div className="flex items-center gap-2.5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-blue via-brand-purple to-brand-teal shadow-lg shadow-brand-cyan/30">
                  <Droplets className="h-6 w-6 text-white" />
                </span>
                <span className="bg-gradient-to-r from-white to-slate-300 bg-clip-text font-display text-2xl font-extrabold text-transparent">
                  TankerDrop
                </span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-400">{t('footer.tagline')}</p>

              <div className="mt-6 flex gap-3">
                {SOCIALS.map(({ label, icon }) => (
                  <motion.a
                    key={label}
                    href="#"
                    aria-label={label}
                    whileHover={{ y: -4, scale: 1.1 }}
                    className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-slate-300 transition-colors duration-200 hover:bg-gradient-to-br hover:from-brand-blue hover:to-brand-teal hover:text-white"
                  >
                    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {icon}
                    </svg>
                  </motion.a>
                ))}
              </div>
            </div>

            {/* Company */}
            <FooterColumn title="Company" links={COMPANY_LINKS} />
            {/* Resources */}
            <div>
              <h3 className="mb-5 font-display text-base font-bold uppercase tracking-wider text-white">Resources</h3>
              <ul className="space-y-3">
                {RESOURCE_LINKS.map(link => (
                  <li key={link.label}>
                    <button
                      onClick={() => navigate(link.page)}
                      className="group inline-flex items-center gap-2 text-sm text-slate-400 transition-all duration-200 hover:translate-x-1 hover:text-white"
                    >
                      <span className="h-px w-0 bg-gradient-to-r from-brand-blue to-brand-teal transition-all duration-200 group-hover:w-3" aria-hidden="true" />
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {/* Legal */}
            <FooterColumn title="Legal" links={LEGAL_LINKS} />

          </div>

          {/* Contact strip */}
          <div className="mt-12 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm sm:grid-cols-3">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-brand-cyan" />
              <span className="text-slate-300">srisivasaienterprises5@gmail.com</span>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-brand-cyan" />
              <span className="text-slate-300">+91 94900 77494</span>
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-brand-cyan" />
              <span className="text-slate-300">India</span>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row">
            <p className="text-xs text-slate-500">{t('footer.copyright')}</p>
            <p className="text-xs text-slate-500">{t('footer.made_in')}</p>
          </div>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h3 className="mb-5 font-display text-base font-bold uppercase tracking-wider text-white">{title}</h3>
      <ul className="space-y-3">
        {links.map(link => (
          <li key={link.label}>
            <a
              href={link.href}
              className="group inline-flex items-center text-sm text-slate-400 transition-all duration-200 hover:translate-x-1 hover:text-white"
            >
              <span className="mr-0 h-px w-0 bg-gradient-to-r from-brand-blue to-brand-teal transition-all duration-200 group-hover:mr-2 group-hover:w-3" aria-hidden="true" />
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
