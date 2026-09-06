import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../../../utils/api'
import { connectSocket } from '../../../utils/socket'
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import type { Notification, NotificationType, NotificationPrefs } from '../../../types'
import React from 'react';

type FilterTab = 'all' | 'unread' | 'order' | 'delivery' | 'system'

const PREFS_KEY = 'wm_notif_prefs'

const DEFAULT_PREFS: NotificationPrefs = {
  orderUpdates:        true,
  deliveryAlerts:      true,
  promotions:          false,
  systemNotifications: true,
}

function loadPrefs(): NotificationPrefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') } }
  catch { return DEFAULT_PREFS }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
}

const TYPE_ICONS: Record<NotificationType, React.ReactNode> = {
  order:    <OrderIcon />,
  delivery: <TruckIcon />,
  system:   <InfoIcon />,
  promo:    <TagIcon />,
}

const TYPE_COLORS: Record<NotificationType, string> = {
  order:    'rgba(144,202,249,0.15)',
  delivery: 'rgba(129,199,132,0.15)',
  system:   'rgba(0,188,212,0.12)',
  promo:    'rgba(255,204,128,0.15)',
}

export default function Notifications() {
  const { t } = useTranslation()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading]  = useState(true)
  const [filter,  setFilter]   = useState<FilterTab>('all')
  const [prefs,   setPrefs]    = useState<NotificationPrefs>(loadPrefs)
  const [marking, setMarking]  = useState(false)

  useEffect(() => {
    getNotifications().then(res => {
      if (res.success) setNotifications(res.data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const socket = connectSocket();
    const handleNewOrder = (order: any) => {
      toast.info('🚚 New order placed! Check your orders tab.', {
        position: 'top-right',
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: 'colored',
      });
      getNotifications().then(res => {
        if (res.success) setNotifications(res.data);
      });
    };
    socket.on('new-order', handleNewOrder);
    return () => {
      socket.off('new-order', handleNewOrder);
    };
  }, [])

  async function handleMarkRead(id: string) {
    const res = await markNotificationRead(id)
    if (res.success) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
      window.dispatchEvent(new CustomEvent('wm:notifications-read'))
    }
  }

  async function handleMarkAll() {
    setMarking(true)
    await markAllNotificationsRead()
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    setMarking(false)
    window.dispatchEvent(new CustomEvent('wm:notifications-read'))
  }

  function togglePref(key: keyof NotificationPrefs) {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  }

  const filtered = notifications.filter(n => {
    if (filter === 'unread')   return !n.isRead
    if (filter === 'order')    return n.type === 'order'
    if (filter === 'delivery') return n.type === 'delivery'
    if (filter === 'system')   return n.type === 'system'
    return true
  })

  const unreadCount = notifications.filter(n => !n.isRead).length

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all',      label: t('profile.notifications.tab_all')      },
    { key: 'unread',   label: `${t('profile.notifications.tab_unread')}${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
    { key: 'order',    label: t('profile.notifications.tab_orders')   },
    { key: 'delivery', label: t('profile.notifications.tab_delivery') },
    { key: 'system',   label: t('profile.notifications.tab_system')   },
  ]

  const prefRows: { key: keyof NotificationPrefs; label: string; desc: string }[] = [
    { key: 'orderUpdates',        label: t('profile.notifications.pref_orders'),  desc: t('profile.notifications.pref_orders_desc')  },
    { key: 'deliveryAlerts',      label: t('profile.notifications.pref_delivery'),desc: t('profile.notifications.pref_delivery_desc')},
    { key: 'promotions',          label: t('profile.notifications.pref_promos'),  desc: t('profile.notifications.pref_promos_desc')  },
    { key: 'systemNotifications', label: t('profile.notifications.pref_system'),  desc: t('profile.notifications.pref_system_desc')  },
  ]

  if (loading) return (
    <div className="panel-card"><div className="panel-loading"><div className="spinner" /></div></div>
  )

  return (
    <>
      <ToastContainer aria-label="Notification Toasts" />
      {/* Notification list */}
      <div className="panel-card">
        <div className="notif-header">
          <div>
            <h2 className="panel__title">{t('profile.notifications.title')}</h2>
            <p className="panel__subtitle" style={{ marginBottom: 0 }}>{t('profile.notifications.subtitle')}</p>
          </div>
          {unreadCount > 0 && (
            <button className="btn-ghost" onClick={handleMarkAll} disabled={marking}>
              {marking ? '…' : t('profile.notifications.mark_all')}
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="notif-tabs">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`notif-tab${filter === tab.key ? ' active' : ''}`}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <p>{t('profile.notifications.empty')}</p>
          </div>
        ) : (
          <div className="notif-list">
            {filtered.map(n => (
              <div
                key={n.id}
                className={`notif-item${n.isRead ? '' : ' notif-item--unread'}`}
                onClick={() => !n.isRead && handleMarkRead(n.id)}
              >
                <div className="notif-item__icon" style={{ background: TYPE_COLORS[n.type] }}>
                  {TYPE_ICONS[n.type]}
                </div>
                <div className="notif-item__body">
                  <div className="notif-item__top">
                    <span className="notif-item__title">{n.title}</span>
                    <span className="notif-item__time">{timeAgo(n.createdAt)}</span>
                  </div>
                  {n.message && <p className="notif-item__msg">{n.message}</p>}
                </div>
                {!n.isRead && <div className="notif-item__dot" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preferences */}
      <div className="panel-card">
        <h3 className="panel__title" style={{ fontSize: '1rem' }}>{t('profile.notifications.prefs_title')}</h3>
        <p className="panel__subtitle">{t('profile.notifications.prefs_subtitle')}</p>

        <div className="notif-prefs">
          {prefRows.map(row => (
            <div key={row.key} className="pref-row">
              <div className="pref-row__info">
                <span className="pref-row__label">{row.label}</span>
                <span className="pref-row__desc">{row.desc}</span>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={prefs[row.key]}
                  onChange={() => togglePref(row.key)}
                />
                <span className="toggle__track">
                  <span className="toggle__thumb" />
                </span>
              </label>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
function OrderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
    </svg>
  )
}
function TruckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1"/>
      <path d="M16 8h4l3 5v3h-7V8z"/>
      <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  )
}
function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  )
}
function TagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  )
}
