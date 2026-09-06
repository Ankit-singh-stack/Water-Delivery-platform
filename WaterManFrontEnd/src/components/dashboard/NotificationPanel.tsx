import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X, ArrowRight, Clock, Droplets, Truck, Megaphone, Info } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NotificationItem {
  id: string
  title: string
  message: string
  type: string
  createdAt: string
  isRead: boolean
}

interface NotificationPanelProps {
  isOpen: boolean
  onClose: () => void
  notifications: NotificationItem[]
}

const TYPE_META: Record<string, { icon: LucideIcon; gradient: string; label: string }> = {
  order: { icon: Droplets, gradient: 'from-blue-400 to-cyan-400', label: 'Order' },
  delivery: { icon: Truck, gradient: 'from-emerald-400 to-teal-400', label: 'Delivery' },
  promo: { icon: Megaphone, gradient: 'from-purple-400 to-violet-400', label: 'Promo' },
  system: { icon: Info, gradient: 'from-slate-400 to-slate-500', label: 'System' },
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const seconds = Math.floor((Date.now() - then) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

export default function NotificationPanel({ isOpen, onClose, notifications }: NotificationPanelProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', onKey)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  const unread = notifications.filter(n => !n.isRead).length

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-ocean shadow-glass-lg"
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Bell className="h-5 w-5 text-brand-cyan" aria-hidden="true" />
                  {unread > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-red-500 to-red-600 px-1 text-[10px] font-bold text-white" aria-label={`${unread} unread`}>
                      {unread}
                    </span>
                  )}
                </div>
                <h2 className="font-display text-lg font-semibold text-white">Notifications</h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Close notifications"
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.06]">
                    <Bell className="h-7 w-7 text-white/40" aria-hidden="true" />
                  </div>
                  <p className="font-body text-sm text-white/50">No notifications yet</p>
                </div>
              ) : (
                <motion.ul
                  initial="hidden"
                  animate="visible"
                  variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
                  className="space-y-3"
                  role="list"
                >
                  {notifications.map(n => {
                    const meta = TYPE_META[n.type] ?? TYPE_META.system
                    const Icon = meta.icon
                    return (
                      <motion.li
                        key={n.id}
                        variants={{ hidden: { opacity: 0, x: 24 }, visible: { opacity: 1, x: 0 } }}
                        className={`rounded-2xl border p-4 transition-colors ${n.isRead ? 'border-white/[0.06] bg-white/[0.03]' : 'border-white/10 bg-white/[0.07]'}`}
                        role="listitem"
                      >
                        <div className="flex gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${meta.gradient}`}>
                            <Icon className="h-4.5 w-4.5 text-white" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate font-body text-sm font-semibold text-white">{n.title}</p>
                              <span className="flex shrink-0 items-center gap-1 font-body text-[11px] text-white/40">
                                <Clock className="h-3 w-3" aria-hidden="true" />
                                {timeAgo(n.createdAt)}
                              </span>
                            </div>
                            <p className="mt-1 font-body text-xs leading-relaxed text-white/60">{n.message}</p>
                          </div>
                        </div>
                      </motion.li>
                    )
                  })}
                </motion.ul>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="border-t border-white/[0.08] p-4">
                <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 font-body text-sm font-semibold text-white transition-colors hover:bg-white/20">
                  View all notifications
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
