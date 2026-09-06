import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getNotifications,
  getNotificationUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../utils/api'
import { connectSocket } from '../../utils/socket'
import { useNav } from '../../context/NavigationContext'
import type { Notification, NotificationType } from '../../types'
import './NotificationBell.css'

type FilterTab = 'all' | 'unread' | 'order' | 'delivery' | 'system'

interface Props {
  basePath?: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
}

const TYPE_ICONS: Record<NotificationType, string> = {
  order:    '📋',
  delivery: '🚚',
  system:   'ℹ',
  promo:    '🏷',
}

export default function NotificationBell({ basePath }: Props) {
  const { t } = useTranslation()
  const { navigate } = useNav()
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [marking, setMarking] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const resp = await getNotificationUnreadCount()
        setUnreadCount(typeof resp === 'number' ? resp : 0)
      } catch { /* ignore */ }
    }
    fetchCount()
    pollRef.current = setInterval(fetchCount, 30000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  useEffect(() => {
    const socket = connectSocket()
    const handleNotif = () => {
      setUnreadCount(prev => prev + 1)
      if (open) loadNotifications()
    }
    const handleNewOrder = () => {
      setUnreadCount(prev => prev + 1)
      if (open) loadNotifications()
    }
    socket.on('notification', handleNotif)
    socket.on('new-order', handleNewOrder)
    socket.on('order-updated', handleNotif)
    socket.on('delivery-request', handleNotif)
    socket.on('delivery-updated', handleNotif)
    return () => {
      socket.off('notification', handleNotif)
      socket.off('new-order', handleNewOrder)
      socket.off('order-updated', handleNotif)
      socket.off('delivery-request', handleNotif)
      socket.off('delivery-updated', handleNotif)
    }
  }, [open])

  useEffect(() => {
    const handler = () => {
      getNotificationUnreadCount().then(c => {
        setUnreadCount(typeof c === 'number' ? c : 0)
      })
    }
    window.addEventListener('wm:notifications-read', handler)
    return () => window.removeEventListener('wm:notifications-read', handler)
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function loadNotifications() {
    setLoading(true)
    try {
      const res = await getNotifications(1, 15)
      if (res.success) setNotifications(res.data)
    } catch { /* ignore */ }
    setLoading(false)
  }

  function handleToggle() {
    const next = !open
    setOpen(next)
    if (next) loadNotifications()
  }

  async function handleMarkRead(id: string) {
    const res = await markNotificationRead(id)
    if (res.success) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
      window.dispatchEvent(new CustomEvent('wm:notifications-read'))
    }
  }

  async function handleMarkAll() {
    setMarking(true)
    await markAllNotificationsRead()
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    setUnreadCount(0)
    setMarking(false)
    window.dispatchEvent(new CustomEvent('wm:notifications-read'))
  }

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.isRead
    if (filter !== 'all') return n.type === filter
    return true
  })

  const localUnread = notifications.filter(n => !n.isRead).length

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: t('profile.notifications.tab_all') },
    { key: 'unread', label: t('profile.notifications.tab_unread') + (localUnread > 0 ? ' (' + localUnread + ')' : '') },
    { key: 'order', label: t('profile.notifications.tab_orders') },
    { key: 'delivery', label: t('profile.notifications.tab_delivery') },
    { key: 'system', label: t('profile.notifications.tab_system') },
  ]

  return (
    <div className="nb-root" ref={panelRef}>
      <button className="nb-bell" onClick={handleToggle} aria-label="Notifications">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span className="nb-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="nb-dropdown">
          <div className="nb-header">
            <h3 className="nb-title">{t('profile.notifications.title')}</h3>
            {localUnread > 0 && (
              <button className="nb-mark-all" onClick={handleMarkAll} disabled={marking}>
                {marking ? '...' : t('profile.notifications.mark_all')}
              </button>
            )}
          </div>

          <div className="nb-tabs">
            {tabs.map(tab => (
              <button
                key={tab.key}
                className={'nb-tab' + (filter === tab.key ? ' active' : '')}
                onClick={() => setFilter(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="nb-list">
            {loading ? (
              <div className="nb-loading"><div className="spinner" /></div>
            ) : filtered.length === 0 ? (
              <div className="nb-empty">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                <p>{t('profile.notifications.empty')}</p>
              </div>
            ) : (
              filtered.map(n => (
                <div
                  key={n.id}
                  className={'nb-item' + (n.isRead ? '' : ' nb-item--unread')}
                  onClick={() => {
                    if (!n.isRead) handleMarkRead(n.id)
                    if (n.orderId) {
                      setOpen(false)
                      navigate('tracking', undefined, 'orderId=' + n.orderId)
                    }
                  }}
                >
                  <div className="nb-item__icon">{TYPE_ICONS[n.type] || 'ℹ'}</div>
                  <div className="nb-item__body">
                    <div className="nb-item__top">
                      <span className="nb-item__title">{n.title}</span>
                      <span className="nb-item__time">{timeAgo(n.createdAt)}</span>
                    </div>
                    {n.message && <p className="nb-item__msg">{n.message}</p>}
                    {n.orderId && <span className="nb-item__link">View order</span>}
                  </div>
                  {!n.isRead && <div className="nb-item__dot" />}
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="nb-footer">
              <button className="nb-view-all" onClick={() => {
                setOpen(false)
                navigate('profile', undefined, 'panel=notifications')
              }}>
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
