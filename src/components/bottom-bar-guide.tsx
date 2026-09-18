'use client';

import React, { useContext, useMemo, useSyncExternalStore } from 'react';
import {
  Activity,
  Clock3,
  Database,
  Gauge,
  HardDrive,
  Info,
  Network,
  Server,
  ShieldCheck,
  Table,
  TerminalSquare
} from 'lucide-react';
import { DatabaseContext } from '@/context/DatabaseContext';
import {
  getActivitiesServerSnapshot,
  getActivitiesSnapshot,
  subscribeActivities
} from '@/lib/activityConsole';

interface BottomBarGuideProps {
  selectedDatabase?: string | null;
  selectedTable?: string | null;
}

const items = [
  { icon: Server, title: 'Bağlantı ve motor', text: 'Bağlantı sağlığı, MySQL/MariaDB motoru, sürüm profili, TLS modu, host ve port bilgilerini gösterir.' },
  { icon: Clock3, title: 'İki farklı süre', text: 'Uptime veritabanı sunucusunun gerçek çalışma süresidir. Coreor süresi ise aktif profilin bu sekmede seçili kaldığı süredir.' },
  { icon: Activity, title: 'Thread ve bağlantılar', text: 'Bağlı thread, çalışan thread, en yüksek bağlantı kullanımı ve reddedilen bağlantı değerleri sunucudan okunur.' },
  { icon: Gauge, title: 'Buffer pool', text: 'InnoDB bellek kullanımı, boş sayfa, dirty page ve hit ratio değerleri sorgu performansını yorumlamaya yardımcı olur.' },
  { icon: HardDrive, title: 'Depolama', text: 'Veri, indeks, boş alan, toplam mantıksal boyut ve seçili veritabanının yaklaşık boyutu gösterilir.' },
  { icon: Network, title: 'Ağ trafiği', text: 'Sunucu açılışından beri alınan ve gönderilen toplam byte sayaçlarıdır; anlık bant genişliği değildir.' },
  { icon: Table, title: 'Grid durumu', text: 'Aktif tablo sayfası, sayfa boyutu, toplam satır, filtre ve sıralama durumunu gösterir.' },
  { icon: TerminalSquare, title: 'SQL özeti', text: 'Bu uygulama oturumundaki kullanıcı işlemleri üzerinden başarı oranı, hata, uyarı ve sorgu süreleri hesaplanır.' }
];

export function BottomBarGuide({ selectedDatabase, selectedTable }: BottomBarGuideProps) {
  const { servers, activeServerId } = useContext(DatabaseContext)!;
  const activities = useSyncExternalStore(subscribeActivities, getActivitiesSnapshot, getActivitiesServerSnapshot);
  const activeServer = servers.find(server => server.id === activeServerId) || null;
  const errorCount = useMemo(() => activities.filter(entry => entry.level === 'error').length, [activities]);

  return (
    <div className="group relative z-[170] flex h-full shrink-0 items-stretch">
      <button
        type="button"
        aria-label="BottomBar ayrıntı rehberi"
        className="flex h-full items-center gap-1.5 px-2.5 text-[9px] text-zinc-500 transition hover:bg-white/[0.04] hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500/30"
        title="BottomBar durum rehberi"
      >
        <Info className="h-3 w-3" />
        <span className="hidden xl:inline">Durum rehberi</span>
      </button>

      <div className="pointer-events-none absolute bottom-[calc(100%+6px)] right-0 hidden w-[min(680px,82vw)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/98 shadow-2xl backdrop-blur-xl group-hover:block group-focus-within:block">
        <div className="border-b border-zinc-800 bg-gradient-to-r from-cyan-500/[0.08] via-transparent to-purple-500/[0.08] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300"><Info className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-zinc-100">BottomBar durum rehberi</div>
              <p className="mt-1 text-[10px] leading-5 text-zinc-500">Her metriğin üzerine geldiğinizde canlı değerleri görebilirsiniz. Bu panel göstergelerin ne anlama geldiğini açıklar.</p>
            </div>
            <span className="rounded-full border border-zinc-800 bg-black/20 px-2 py-1 text-[8px] text-zinc-500">v2.0.2</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-zinc-800 bg-black/20 p-2.5"><div className="text-[8px] uppercase tracking-wider text-zinc-600">Sunucu</div><div className="mt-1 truncate text-[10px] font-medium text-zinc-200">{activeServer?.name || 'Seçilmedi'}</div></div>
            <div className="rounded-lg border border-zinc-800 bg-black/20 p-2.5"><div className="text-[8px] uppercase tracking-wider text-zinc-600">Veritabanı</div><div className="mt-1 truncate text-[10px] font-medium text-zinc-200">{selectedDatabase || 'Sunucu geneli'}</div></div>
            <div className="rounded-lg border border-zinc-800 bg-black/20 p-2.5"><div className="text-[8px] uppercase tracking-wider text-zinc-600">Tablo</div><div className="mt-1 truncate text-[10px] font-medium text-zinc-200">{selectedTable || 'Seçilmedi'}</div></div>
            <div className="rounded-lg border border-zinc-800 bg-black/20 p-2.5"><div className="text-[8px] uppercase tracking-wider text-zinc-600">SQL oturumu</div><div className={`mt-1 text-[10px] font-medium ${errorCount ? 'text-amber-300' : 'text-emerald-300'}`}>{activities.length} işlem • {errorCount} hata</div></div>
          </div>
        </div>

        <div className="grid gap-px bg-zinc-800 sm:grid-cols-2">
          {items.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex gap-3 bg-zinc-950 p-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-black/20 text-zinc-500"><Icon className="h-3.5 w-3.5" /></div>
                <div><div className="text-[10px] font-semibold text-zinc-200">{item.title}</div><p className="mt-1 text-[9px] leading-4 text-zinc-600">{item.text}</p></div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 border-t border-zinc-800 px-4 py-3 text-[9px] text-zinc-600">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          Arka plan durum kontrolleri SQL günlüğüne eklenmez; parola ve hassas bağlantı bilgileri tooltip içinde gösterilmez.
        </div>
      </div>
    </div>
  );
}
