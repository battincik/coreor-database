'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/context/LanguageContext';
import { DatabaseMenuBar } from '@/components/database-menu-bar';
import BottomBar from '@/components/BottomBar';
import { AppContextMenuProvider } from '@/components/app-context-menu';
import { CoreorToastProvider } from '@/components/ui/coreor-toast';
import { DatabaseNotificationMonitor } from '@/components/database-notification-monitor';
import { RuntimeCompatibility } from '@/components/runtime-compatibility';
import { ArrowLeft, Bell, CheckCheck, CircleAlert, Search, Trash2, XCircle } from 'lucide-react';
import {
  clearNotifications,
  getNotificationsServerSnapshot,
  getNotificationsSnapshot,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeNotifications,
  type CoreorNotification,
  type CoreorNotificationSeverity
} from '@/lib/notificationStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function severityLabel(value: CoreorNotificationSeverity, t: (key: string) => string) {
  if (value === 'error' || value === 'danger') return t('common.error');
  if (value === 'warning') return t('common.warning');
  if (value === 'success') return t('common.success');
  return t('notificationCenter.info');
}

function severityClass(value: CoreorNotificationSeverity) {
  if (value === 'error' || value === 'danger') return 'border-red-500/25 bg-red-500/[0.06] text-red-300';
  if (value === 'warning') return 'border-amber-500/25 bg-amber-500/[0.06] text-amber-300';
  if (value === 'success') return 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-300';
  return 'border-cyan-500/25 bg-cyan-500/[0.06] text-cyan-300';
}

function notificationGuidance(notification: CoreorNotification, t: (key: string) => string) {
  if (notification.code === 'SLOW_SQL') {
    return {
      meaning: t('notificationCenter.slowMeaning'),
      cause: t('notificationCenter.slowCause'),
      action: t('notificationCenter.slowAction')
    };
  }
  if (notification.source === 'storage') {
    return {
      meaning: t('notificationCenter.storageMeaning'),
      cause: t('notificationCenter.storageCause'),
      action: t('notificationCenter.storageAction')
    };
  }
  if (notification.source === 'performance') {
    return {
      meaning: t('notificationCenter.performanceMeaning'),
      cause: t('notificationCenter.performanceCause'),
      action: t('notificationCenter.performanceAction')
    };
  }
  if (notification.source === 'connection') {
    return {
      meaning: t('notificationCenter.connectionMeaning'),
      cause: t('notificationCenter.connectionCause'),
      action: t('notificationCenter.connectionAction')
    };
  }
  if (notification.source === 'sql' && (notification.severity === 'error' || notification.severity === 'danger')) {
    return {
      meaning: t('notificationCenter.sqlMeaning'),
      cause: t('notificationCenter.sqlCause'),
      action: t('notificationCenter.sqlAction')
    };
  }
  return {
    meaning: t('notificationCenter.genericMeaning'),
    cause: t('notificationCenter.genericCause'),
    action: t('notificationCenter.genericAction')
  };
}

function Detail({ notification }: { notification: CoreorNotification | null }) {
  const { t, formatDate } = useLanguage();
  if (!notification) return <div className="flex h-full items-center justify-center text-xs text-zinc-700">{t('notificationCenter.selectForDetails')}</div>;
  const guidance = notificationGuidance(notification, t);
  return (
    <div className="coreor-scrollbar h-full overflow-y-auto p-5">
      <div className="mx-auto max-w-4xl space-y-5">
        <header>
          <div className="flex items-center gap-2">
            <span className={`rounded-lg border px-2 py-1 text-[9px] ${severityClass(notification.severity)}`}>{severityLabel(notification.severity, t)}</span>
            <span className="text-[9px] text-zinc-600">{formatDate(notification.createdAt, { dateStyle: 'medium', timeStyle: 'medium' })}</span>
          </div>
          <h1 className="mt-3 text-xl font-semibold text-zinc-100">{notification.title}</h1>
          {notification.description && <p className="mt-2 max-w-3xl text-[11px] leading-5 text-zinc-400">{notification.description}</p>}
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [t('notificationCenter.source'), notification.source],
            [t('statusGuide.server'), notification.serverName || '—'],
            [t('database.database'), notification.databaseName || t('query.serverScope')],
            [t('notificationCenter.code'), notification.code || '—']
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-zinc-800 bg-black/20 p-3"><div className="text-[8px] uppercase tracking-wider text-zinc-700">{label}</div><div className="mt-1 break-all text-[10px] text-zinc-300">{value}</div></div>)}
        </section>

        <section className="grid gap-3 lg:grid-cols-3">
          {[
            [t('notificationCenter.meaningTitle'), guidance.meaning],
            [t('notificationCenter.likelyCause'), guidance.cause],
            [t('notificationCenter.whatToCheck'), guidance.action]
          ].map(([title, text]) => <div key={title} className="rounded-2xl border border-zinc-800 bg-black/20 p-4"><div className="text-[9px] font-semibold text-zinc-300">{title}</div><p className="mt-2 text-[10px] leading-5 text-zinc-500">{text}</p></div>)}
        </section>

        {notification.metadata.length > 0 && <section className="rounded-2xl border border-zinc-800 bg-black/20">
          <div className="border-b border-zinc-800 px-4 py-3 text-[11px] font-semibold">{t('notificationCenter.technicalDetails')}</div>
          <div className="grid gap-px bg-zinc-800 sm:grid-cols-2">
            {notification.metadata.map(item => <div key={item.label} className="bg-zinc-950 px-4 py-3"><div className="text-[8px] uppercase tracking-wider text-zinc-700">{item.label}</div><div className="mt-1 break-words font-mono text-[10px] text-zinc-300">{item.value}</div></div>)}
          </div>
        </section>}

        <section className="rounded-2xl border border-zinc-800 bg-black/20 p-4 text-[10px] leading-5 text-zinc-500">
          {t('notificationCenter.localHistoryNote')}
        </section>
      </div>
    </div>
  );
}

function NotificationHistoryContent() {
  const { t, language, formatDate } = useLanguage();
  const router = useRouter();
  const notifications = useSyncExternalStore(subscribeNotifications, getNotificationsSnapshot, getNotificationsServerSnapshot);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'warning' | 'error'>('all');

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Modal Escape handlers run in capture phase and stop propagation first.
      // If only a context menu is open, let the first Escape close that menu.
      if (document.querySelector('[data-coreor-context-menu="true"]')) return;
      router.push('/editor/');
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [router]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    const next = id && notifications.some(item => item.id === id) ? id : notifications[0]?.id || null;
    setSelectedId(current => current || next);
    if (next) markNotificationRead(next);
  }, [notifications.length]);

  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase(language);
    return notifications.filter(item => {
      if (filter === 'unread' && item.readAt) return false;
      if (filter === 'warning' && item.severity !== 'warning') return false;
      if (filter === 'error' && item.severity !== 'error' && item.severity !== 'danger') return false;
      if (!search) return true;
      return [item.title, item.description, item.serverName, item.databaseName, item.code, item.source]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase(language).includes(search));
    });
  }, [notifications, query, filter, language]);

  const selected = notifications.find(item => item.id === selectedId) || null;
  const unread = notifications.filter(item => !item.readAt).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 px-3">
        <Button variant="ghost" size="sm" className="h-8 px-2 text-[10px]" onClick={() => router.push('/editor/')}><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />{t('notificationCenter.backToEditor')}</Button>
        <Bell className="h-4 w-4 text-cyan-400" />
        <div className="min-w-0 flex-1"><div className="text-[12px] font-semibold">{t('notificationCenter.title')}</div><div className="text-[8px] text-zinc-600">{t('notificationCenter.summary', { total: notifications.length, unread })}</div></div>
        <Button variant="ghost" size="sm" className="h-8 text-[9px]" onClick={markAllNotificationsRead}><CheckCheck className="mr-1.5 h-3.5 w-3.5" />{t('notificationCenter.markAllReadShort')}</Button>
        <Button variant="ghost" size="sm" className="h-8 text-[9px] text-red-400" onClick={() => { clearNotifications(); setSelectedId(null); }}><Trash2 className="mr-1.5 h-3.5 w-3.5" />{t('notificationCenter.clearHistory')}</Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[min(390px,36vw)] min-w-[280px] flex-col border-r border-zinc-800">
          <div className="space-y-2 border-b border-zinc-800 p-2">
            <div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-700" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('notificationCenter.search')} className="h-8 pl-8 text-[10px]" /></div>
            <div className="flex gap-1">{(['all','unread','warning','error'] as const).map(value => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded px-2 py-1 text-[8px] ${filter === value ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-600 hover:text-zinc-300'}`}>{value === 'all' ? t('common.all') : value === 'unread' ? t('notificationCenter.unread') : value === 'warning' ? t('notificationCenter.warnings') : t('notificationCenter.errors')}</button>)}</div>
          </div>
          <div className="coreor-scrollbar min-h-0 flex-1 overflow-y-auto">
            {visible.map(item => (
              <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); markNotificationRead(item.id); }} className={`flex w-full gap-2 border-b border-zinc-900 px-3 py-3 text-left hover:bg-white/[0.025] ${selectedId === item.id ? 'bg-cyan-500/[0.05]' : !item.readAt ? 'bg-cyan-500/[0.02]' : ''}`}>
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${severityClass(item.severity)}`}>{item.severity === 'error' || item.severity === 'danger' ? <XCircle className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}</span>
                <span className="min-w-0 flex-1"><span className={`block truncate text-[10px] font-medium ${item.readAt ? 'text-zinc-400' : 'text-zinc-100'}`}>{item.title}</span><span className="mt-0.5 block truncate text-[8px] text-zinc-600">{item.description || item.source}</span><span className="mt-1 block text-[8px] text-zinc-700">{formatDate(item.createdAt, { dateStyle: 'short', timeStyle: 'short' })}</span></span>
              </button>
            ))}
          </div>
        </aside>
        <main className="min-w-0 flex-1"><Detail notification={selected} /></main>
      </div>
    </div>
  );
}


export function NotificationHistoryPage() {
  return (
    <CoreorToastProvider>
      <AppContextMenuProvider>
        <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-zinc-950">
          <RuntimeCompatibility />
          <DatabaseNotificationMonitor />
          <div data-coreor-app-chrome="top" className="relative z-[2147483000] shrink-0">
            <DatabaseMenuBar selectedDatabase={null} selectedTable={null} />
          </div>
          <NotificationHistoryContent />
          <div data-coreor-app-chrome="bottom" className="relative z-[2147483000] shrink-0">
            <BottomBar selectedDatabase={null} selectedTable={null} />
          </div>
        </div>
      </AppContextMenuProvider>
    </CoreorToastProvider>
  );
}
