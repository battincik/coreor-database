'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, ChevronRight, CircleAlert, Clock3, Copy, XCircle } from 'lucide-react';
import {
  getNotificationsServerSnapshot,
  getNotificationsSnapshot,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeNotifications,
  formatCoreorNotificationReport,
  type CoreorNotification
} from '@/lib/notificationStore';
import { useLanguage } from '@/context/LanguageContext';

function timeLabel(value: string, language: string, t: (key:string,values?:Record<string,string|number>)=>string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return t('notificationCenter.now');
  if (diff < 3_600_000) return t('notificationCenter.minutesAgo',{count:Math.floor(diff/60_000)});
  if (diff < 86_400_000) return t('notificationCenter.hoursAgo',{count:Math.floor(diff/3_600_000)});
  return date.toLocaleDateString(language, { day: '2-digit', month: '2-digit' });
}

function tone(notification: CoreorNotification) {
  if (notification.severity === 'error' || notification.severity === 'danger') return 'text-red-300 bg-red-500/10';
  if (notification.severity === 'warning') return 'text-amber-300 bg-amber-500/10';
  if (notification.severity === 'success') return 'text-emerald-300 bg-emerald-500/10';
  return 'text-cyan-300 bg-cyan-500/10';
}

export function DatabaseNotificationBell() {
  const router = useRouter();
  const {t,language,formatNumber}=useLanguage();
  const notifications = useSyncExternalStore(subscribeNotifications, getNotificationsSnapshot, getNotificationsServerSnapshot);
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const unread = notifications.filter(item => !item.readAt).length;
  const visible = useMemo(
    () => notifications.filter(item => !unreadOnly || !item.readAt).slice(0, 50),
    [notifications, unreadOnly]
  );

  const openNotification = useCallback((id: string) => {
    markNotificationRead(id);
    setOpen(false);
    router.push(`/editor/notifications/?id=${encodeURIComponent(id)}`);
  }, [router]);

  useEffect(() => {
    const externalOpen = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id) openNotification(id);
      else setOpen(true);
    };
    const outside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('coreor:open-notification', externalOpen);
    document.addEventListener('mousedown', outside);
    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('coreor:open-notification', externalOpen);
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', keydown);
    };
  }, [openNotification]);

  return (
    <div ref={rootRef} className="relative flex shrink-0 items-stretch border-l border-zinc-800/70">
      <button
        type="button"
        className="relative flex h-8 w-9 items-center justify-center text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-100"
        onClick={() => setOpen(value => !value)}
        title={t('notificationCenter.notifications')}
        aria-label={t('notificationCenter.notifications')}
      >
        <Bell className="h-3.5 w-3.5" />
        {unread > 0 && <span className="absolute right-1 top-1 min-w-3.5 rounded-full bg-cyan-500 px-1 text-center text-[7px] font-semibold leading-3.5 text-black">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[2147483100] mt-px flex h-[min(620px,calc(100dvh-44px))] w-[min(380px,calc(100vw-16px))] flex-col overflow-hidden rounded-b-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
          <header className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-800 px-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-zinc-100">{t('notificationCenter.notifications')}</div>
              <div className="text-[8px] text-zinc-600">{t('notificationCenter.bellSummary',{unread:formatNumber(unread),count:50})}</div>
            </div>
            <button type="button" className="rounded p-1.5 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200" title={t('notificationCenter.markAllRead')} onClick={markAllNotificationsRead}><CheckCheck className="h-3.5 w-3.5" /></button>
          </header>

          <div className="flex shrink-0 gap-1 border-b border-zinc-800 px-2 py-1.5">
            <button type="button" onClick={() => setUnreadOnly(false)} className={`rounded px-2 py-1 text-[9px] ${!unreadOnly ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>{t('notificationCenter.all')}</button>
            <button type="button" onClick={() => setUnreadOnly(true)} className={`rounded px-2 py-1 text-[9px] ${unreadOnly ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>{t('notificationCenter.unread')}</button>
          </div>

          <div className="coreor-scrollbar min-h-0 flex-1 overflow-y-auto">
            {visible.length ? visible.map(notification => (
              <div key={notification.id} className={`relative border-b border-zinc-900 ${notification.readAt ? '' : 'bg-cyan-500/[0.025]'}`}>
                <button
                  type="button"
                  onClick={() => openNotification(notification.id)}
                  className="group flex w-full gap-2.5 px-3 py-2.5 pr-16 text-left transition hover:bg-white/[0.025]"
                >
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${tone(notification)}`}>
                    {notification.severity === 'error' || notification.severity === 'danger' ? <XCircle className="h-3.5 w-3.5" /> : notification.severity === 'warning' ? <CircleAlert className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`min-w-0 flex-1 truncate text-[10px] font-medium ${notification.readAt ? 'text-zinc-400' : 'text-zinc-100'}`}>{notification.title}</span>
                      <span className="shrink-0 text-[8px] text-zinc-700">{timeLabel(notification.createdAt,language,t)}</span>
                    </span>
                    {notification.description && <span className="mt-0.5 block truncate text-[8px] text-zinc-600">{notification.description}</span>}
                    <span className="mt-1 block truncate text-[8px] text-zinc-700">{[notification.serverName, notification.databaseName, notification.code].filter(Boolean).join(' • ') || notification.source}</span>
                  </span>
                  <ChevronRight className="mt-1 h-3 w-3 shrink-0 text-zinc-800 transition group-hover:text-zinc-500" />
                </button>
                <button
                  type="button"
                  className="absolute right-8 top-2.5 rounded p-1.5 text-zinc-700 transition hover:bg-zinc-900 hover:text-zinc-200"
                  title={t('common.copy')}
                  aria-label={t('common.copy')}
                  onClick={event => {
                    event.stopPropagation();
                    void navigator.clipboard.writeText(formatCoreorNotificationReport(notification));
                  }}
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            )) : <div className="flex h-full min-h-40 items-center justify-center text-[10px] text-zinc-700">{t('notificationCenter.empty')}</div>}
          </div>

          <button
            type="button"
            className="flex h-10 shrink-0 items-center justify-center gap-2 border-t border-zinc-800 text-[9px] font-medium text-cyan-300 hover:bg-cyan-500/[0.04]"
            onClick={() => { setOpen(false); router.push('/editor/notifications/'); }}
          >
            {t('notificationCenter.viewAll')} <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
