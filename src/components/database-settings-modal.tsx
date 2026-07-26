'use client';

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import {
  Accessibility,
  Activity,
  Braces,
  CheckCircle2,
  Database,
  Eye,
  Gauge,
  HardDrive,
  KeyRound,
  LayoutPanelLeft,
  Loader2,
  Monitor,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Type,
  User,
  Wifi,
  X,
  XCircle,
  Zap
} from 'lucide-react';
import type { DatabaseServerConfig } from 'types';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useAuth } from '@/context/AuthContext';
import { fetchServerTables, testStoredDatabaseConnection } from '@/lib/databaseApi';
import { writeEncryptedServerProfiles } from '@/lib/secureVault';
import {
  useAppPreferences,
  type AppFontFamily,
  type AppThemeName,
  type SyntaxThemeName
} from '@/lib/appPreferences';
import type { OpenSettingsModalDetail } from '@/lib/databaseToolEvents';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CoreorSwitch } from '@/components/ui/coreor-switch';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
import { ReleaseNotesTree } from '@/components/release-notes-tree';

export type DatabaseSettingsTab = NonNullable<OpenSettingsModalDetail['tab']>;

interface DatabaseSettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: DatabaseSettingsTab;
}

const tabs: Array<{
  id: DatabaseSettingsTab;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'account', label: 'Hesap', description: 'GitHub oturumu, kasa ve cihaz', icon: User },
  { id: 'servers', label: 'Sunucular', description: 'Profiller, katalog ve bağlantı', icon: Server },
  { id: 'appearance', label: 'Görünüm', description: 'Tema, tipografi ve yoğunluk', icon: Monitor },
  { id: 'accessibility', label: 'Erişilebilirlik', description: 'Kontrast, hareket ve okuma', icon: Accessibility },
  { id: 'query', label: 'Sorgu editörü', description: 'Autocomplete, grid ve çalışma alanı', icon: Terminal },
  { id: 'security', label: 'Güvenlik', description: 'Onaylar, oturum ve erişim politikası', icon: ShieldCheck },
  { id: 'advanced', label: 'Gelişmiş', description: 'Process, aktarım ve yerel durum', icon: Settings2 },
  { id: 'whats-new', label: 'Yenilikler', description: 'Bütün sürümler ve pull request geçmişi', icon: Sparkles }
];

const appThemes: Array<{ id: AppThemeName; title: string; description: string; colors: string[] }> = [
  { id: 'amoled', title: 'AMOLED', description: 'Tam siyah ve yüksek kontrast', colors: ['#000000', '#09090b', '#22d3ee'] },
  { id: 'graphite', title: 'Graphite', description: 'Dengeli koyu gri yüzeyler', colors: ['#13151a', '#27272a', '#38bdf8'] },
  { id: 'midnight', title: 'Midnight', description: 'Mor ve gece mavisi', colors: ['#0b1020', '#171d34', '#a78bfa'] },
  { id: 'nord', title: 'Nord', description: 'Soğuk, sakin tonlar', colors: ['#2e3440', '#3b4252', '#88c0d0'] },
  { id: 'solarized', title: 'Solarized', description: 'Düşük göz yorgunluğu', colors: ['#002b36', '#073642', '#2aa198'] },
  { id: 'light', title: 'Aydınlık', description: 'Gündüz kullanımına uygun', colors: ['#f8fafc', '#ffffff', '#0ea5e9'] },
  { id: 'high-contrast', title: 'Yüksek Kontrast', description: 'Keskin sınırlar ve metin', colors: ['#000000', '#ffffff', '#fff200'] }
];

const syntaxThemes: Array<{ id: SyntaxThemeName; label: string; description: string }> = [
  { id: 'coreor', label: 'Coreor Cyan', description: 'Coreor arayüzüyle uyumlu varsayılan tema' },
  { id: 'dracula', label: 'Dracula', description: 'Mor ve pembe vurgulu koyu tema' },
  { id: 'nord', label: 'Nord', description: 'Düşük kontrastlı soğuk palet' },
  { id: 'monokai', label: 'Monokai', description: 'Klasik canlı syntax renkleri' },
  { id: 'github-dark', label: 'GitHub Dark', description: 'GitHub koyu kod görünümü' },
  { id: 'github-light', label: 'GitHub Light', description: 'Aydınlık kod görünümü' }
];

const fontOptions: SearchSelectOption<AppFontFamily>[] = [
  { value: 'system', label: 'Sistem arayüz yazısı', description: 'İşletim sisteminin doğal sans-serif yazısı', badge: 'Varsayılan' },
  { value: 'mono', label: 'Monospace', description: 'Bütün arayüzde teknik ve eşit aralıklı görünüm' },
  { value: 'humanist', label: 'Humanist', description: 'Uzun metinlerde daha rahat okunabilirlik', badge: 'Okunaklı' },
  { value: 'serif', label: 'Serif', description: 'Klasik belge ve rapor görünümü' }
];

const colorBlindOptions: SearchSelectOption<'none' | 'protanopia' | 'deuteranopia' | 'tritanopia'>[] = [
  { value: 'none', label: 'Filtre kapalı', description: 'Renkler değişmeden gösterilir.', badge: 'Varsayılan' },
  { value: 'protanopia', label: 'Protanopia', description: 'Kırmızı algısı için renk düzeltmesi' },
  { value: 'deuteranopia', label: 'Deuteranopia', description: 'Yeşil algısı için renk düzeltmesi' },
  { value: 'tritanopia', label: 'Tritanopia', description: 'Mavi ve sarı algısı için renk düzeltmesi' }
];

const resultLimitOptions: SearchSelectOption[] = [
  { value: '500', label: '500 satır', description: 'Hızlı önizleme ve düşük bellek kullanımı' },
  { value: '1000', label: '1.000 satır', description: 'Küçük ve orta tablolar' },
  { value: '5000', label: '5.000 satır', description: 'Dengeli varsayılan sonuç sınırı', badge: 'Önerilen' },
  { value: '10000', label: '10.000 satır', description: 'Geniş inceleme oturumları' },
  { value: '50000', label: '50.000 satır', description: 'Yüksek bellek kullanabilir', badge: 'Ağır' }
];

const batchOptions: SearchSelectOption[] = [
  { value: '25', label: '25 satır', description: 'Yavaş bağlantılarda güvenli küçük paket' },
  { value: '100', label: '100 satır', description: 'Düşük kaynak kullanımı' },
  { value: '250', label: '250 satır', description: 'Dengeli aktarım paketi', badge: 'Varsayılan' },
  { value: '500', label: '500 satır', description: 'Hızlı sunucular için büyük paket' },
  { value: '1000', label: '1.000 satır', description: 'Yüksek bellek ve paket boyutu', badge: 'Büyük' }
];

const RANGE_CLASS = 'h-1.5 w-40 cursor-pointer appearance-none rounded-full bg-zinc-800 accent-cyan-400';

function initials(name?: string | null, email?: string | null) {
  return (name?.trim() || email?.trim() || 'C')
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');
}

function SettingRow({
  title,
  description,
  icon: Icon,
  children
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[68px] items-center gap-4 border-b border-zinc-800/70 py-3.5 last:border-b-0">
      {Icon && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-black/20 text-zinc-500"><Icon className="h-3.5 w-3.5" /></div>}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-zinc-200">{title}</div>
        {description && <div className="mt-1 text-[9px] leading-4 text-zinc-600">{description}</div>}
      </div>
      <div className="w-44 shrink-0">{children}</div>
    </div>
  );
}

function Section({
  title,
  description,
  icon: Icon,
  children,
  className = ''
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-zinc-800 bg-black/20 p-4 ${className}`}>
      <div className="mb-3 flex items-start gap-3">
        {Icon && <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-cyan-300"><Icon className="h-4 w-4" /></div>}
        <div className="min-w-0"><h3 className="text-xs font-semibold text-zinc-100">{title}</h3>{description && <p className="mt-1 text-[9px] leading-4 text-zinc-600">{description}</p>}</div>
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, detail, tone = 'normal' }: { label: string; value: React.ReactNode; detail: string; tone?: 'normal' | 'success' | 'cyan' | 'warning' }) {
  const toneClass = tone === 'success' ? 'text-emerald-300' : tone === 'cyan' ? 'text-cyan-300' : tone === 'warning' ? 'text-amber-300' : 'text-zinc-100';
  return <div className="rounded-xl border border-zinc-800 bg-black/20 p-3.5"><div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-zinc-600">{label}</div><div className={`mt-2 text-lg font-semibold ${toneClass}`}>{value}</div><div className="mt-1 text-[9px] leading-4 text-zinc-600">{detail}</div></div>;
}

function formatServer(server: DatabaseServerConfig) {
  return `${server.host || 'host yok'}:${server.port || 3306}`;
}

export function DatabaseSettingsModal({ open, onClose, initialTab = 'account' }: DatabaseSettingsModalProps) {
  const { data: session } = useSession();
  const { activeToken } = useAuth();
  const databaseContext = useContext(DatabaseContext);
  const { preferences, setPreferences, resetPreferences } = useAppPreferences();
  const [activeTab, setActiveTab] = useState<DatabaseSettingsTab>(initialTab);
  const [search, setSearch] = useState('');
  const [busyServerId, setBusyServerId] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<Record<string, { tone: 'success' | 'error'; text: string }>>({});

  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filteredTabs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('tr-TR');
    if (!query) return tabs;
    return tabs.filter(tab => `${tab.label} ${tab.description}`.toLocaleLowerCase('tr-TR').includes(query));
  }, [search]);

  if (!open || typeof document === 'undefined' || !databaseContext) return null;

  const { servers, activeServerId, setActiveServerId, loadServers, isServersLoading } = databaseContext;
  const user = session?.user;
  const activeServer = servers.find(server => server.id === activeServerId) || null;
  const databaseCount = servers.reduce((total, server) => total + (server.databases?.length || 0), 0);
  const tableCount = servers.reduce((total, server) => total + (server.databases || []).reduce((sum, database) => sum + database.tableCount, 0), 0);

  const testServer = async (server: DatabaseServerConfig) => {
    if (!activeToken || busyServerId) return;
    setBusyServerId(server.id);
    try {
      const result = await testStoredDatabaseConnection(server.id, activeToken);
      setServerStatus(previous => ({ ...previous, [server.id]: { tone: 'success', text: result.connection?.version || 'Bağlantı başarılı' } }));
    } catch (error) {
      setServerStatus(previous => ({ ...previous, [server.id]: { tone: 'error', text: error instanceof Error ? error.message : 'Bağlantı başarısız' } }));
    } finally {
      setBusyServerId(null);
    }
  };

  const refreshServer = async (server: DatabaseServerConfig) => {
    if (!activeToken || busyServerId) return;
    setBusyServerId(server.id);
    try {
      await fetchServerTables(server.id, activeToken);
      await loadServers();
      setServerStatus(previous => ({ ...previous, [server.id]: { tone: 'success', text: 'Katalog yenilendi' } }));
    } catch (error) {
      setServerStatus(previous => ({ ...previous, [server.id]: { tone: 'error', text: error instanceof Error ? error.message : 'Katalog yenilenemedi' } }));
    } finally {
      setBusyServerId(null);
    }
  };

  const deleteServer = async (server: DatabaseServerConfig) => {
    if (!activeToken || !window.confirm(`${server.name} bağlantısı bu cihazdaki şifreli kasadan silinsin mi?`)) return;
    await writeEncryptedServerProfiles(activeToken, servers.filter(item => item.id !== server.id));
    if (activeServerId === server.id) setActiveServerId(servers.find(item => item.id !== server.id)?.id || null);
    await loadServers();
  };

  const renderAccount = () => (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Oturum" value="Aktif" detail="GitHub hesabıyla doğrulandı" tone="success" />
        <StatCard label="Sunucu profili" value={servers.length} detail="Bu cihazdaki şifreli kasada" tone="cyan" />
        <StatCard label="Veritabanı" value={databaseCount} detail="Katalog önbelleğinde" />
        <StatCard label="Tablo" value={tableCount} detail="Bütün sunucu profillerinde" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Section title="GitHub hesabı" description="Kimlik bilgileri NextAuth oturumundan okunur ve bağlantı kasasının anahtar kapsamını belirler." icon={User}>
          <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <Avatar className="h-16 w-16 border border-zinc-700"><AvatarImage src={user?.image || undefined} alt={user?.name || 'Coreor kullanıcısı'} /><AvatarFallback>{initials(user?.name, user?.email)}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1"><div className="truncate text-base font-semibold text-zinc-100">{user?.name || 'Coreor kullanıcısı'}</div><div className="mt-1 truncate text-xs text-zinc-500">{user?.email || 'E-posta paylaşılmadı'}</div><div className="mt-3 flex flex-wrap gap-2"><span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[9px] text-emerald-300"><CheckCircle2 className="h-3 w-3" />Oturum açık</span><span className="rounded-full border border-zinc-800 bg-black/20 px-2 py-1 text-[9px] text-zinc-500">Cihaz kasası bağlı</span></div></div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-zinc-800 p-3"><div className="text-[9px] text-zinc-600">Aktif sunucu</div><div className="mt-1 truncate text-[11px] font-medium text-zinc-200">{activeServer?.name || 'Seçilmedi'}</div></div><div className="rounded-xl border border-zinc-800 p-3"><div className="text-[9px] text-zinc-600">Kasa kimliği</div><div className="mt-1 truncate font-mono text-[10px] text-zinc-400">{activeToken ? `${activeToken.slice(0, 8)}••••` : 'Oturum bekleniyor'}</div></div></div>
        </Section>
        <Section title="Veri koruma modeli" description="Bağlantı profillerinin hangi katmanlardan geçtiği." icon={KeyRound}>
          <div className="space-y-2">{[
            ['1', 'Hesap kapsamı', 'Kasa verisi GitHub oturum kimliğine bağlanır.'],
            ['2', 'Tarayıcı şifrelemesi', 'Profil verileri AES-GCM ile cihazda şifrelenir.'],
            ['3', 'İstek anında çözme', 'Parola yalnızca doğrulanmış API isteğinde kullanılır.'],
            ['4', 'Kalıcı sunucu kaydı yok', 'Uygulama sunucusu parolayı veritabanına yazmaz.']
          ].map(([number, title, text]) => <div key={number} className="flex gap-3 rounded-xl border border-zinc-800 bg-black/20 p-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-[9px] font-semibold text-cyan-300">{number}</span><div><div className="text-[10px] font-medium text-zinc-200">{title}</div><div className="mt-1 text-[9px] leading-4 text-zinc-600">{text}</div></div></div>)}</div>
        </Section>
      </div>
    </div>
  );

  const renderServers = () => (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3"><StatCard label="Kayıtlı profil" value={servers.length} detail="Şifreli tarayıcı kasası" tone="cyan" /><StatCard label="Katalog" value={`${databaseCount} DB`} detail={`${tableCount.toLocaleString('tr-TR')} tablo bulundu`} /><StatCard label="Aktif bağlantı" value={activeServer?.name || 'Yok'} detail={activeServer ? formatServer(activeServer) : 'Bir profil seçin'} tone={activeServer ? 'success' : 'warning'} /></div>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-black/20 p-4"><div><h3 className="text-sm font-semibold">Sunucu profilleri</h3><p className="mt-1 text-[9px] text-zinc-600">Bağlantıyı test edin, kataloğu yenileyin veya profil ayrıntılarını düzenleyin.</p></div><Button size="sm" className="h-9 text-[10px]" onClick={() => window.dispatchEvent(new Event('coreor:open-server-modal'))}><Plus className="mr-1.5 h-3.5 w-3.5" />Sunucu ekle</Button></div>
      {isServersLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-800 py-20 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Şifreli kasa yükleniyor…</div>
      ) : servers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 py-20 text-center"><Server className="mx-auto h-9 w-9 text-zinc-700" /><div className="mt-3 text-sm text-zinc-400">Henüz sunucu eklenmedi.</div><Button size="sm" className="mt-4" onClick={() => window.dispatchEvent(new Event('coreor:open-server-modal'))}>İlk sunucuyu ekle</Button></div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {servers.map(server => {
            const status = serverStatus[server.id];
            const databases = server.databases || [];
            const tables = databases.reduce((total, database) => total + database.tableCount, 0);
            return (
              <article key={server.id} className={`rounded-2xl border p-4 transition ${activeServerId === server.id ? 'border-cyan-500/40 bg-cyan-500/[0.04] shadow-[0_0_24px_rgba(6,182,212,0.05)]' : 'border-zinc-800 bg-black/20 hover:border-zinc-700'}`}>
                <div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950"><Database className="h-5 w-5 text-emerald-400" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><button type="button" className="truncate text-left text-xs font-semibold" onClick={() => setActiveServerId(server.id)}>{server.name}</button>{activeServerId === server.id && <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[8px] text-cyan-300">AKTİF</span>}</div><div className="mt-1 truncate font-mono text-[10px] text-zinc-500">{formatServer(server)}</div><div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded bg-zinc-900 px-1.5 py-1 text-[8px] text-zinc-500">{server.databaseType === 'mariadb' ? 'MariaDB' : 'MySQL'} {server.version || ''}</span><span className="rounded bg-zinc-900 px-1.5 py-1 text-[8px] text-zinc-500">TLS {server.sslMode || 'required'}</span><span className="rounded bg-zinc-900 px-1.5 py-1 text-[8px] text-zinc-500">{databases.length} DB</span><span className="rounded bg-zinc-900 px-1.5 py-1 text-[8px] text-zinc-500">{tables} tablo</span></div></div></div>
                {status && <div className={`mt-3 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[9px] ${status.tone === 'success' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{status.tone === 'success' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}<span className="truncate">{status.text}</span></div>}
                <div className="mt-4 flex flex-wrap gap-1"><Button variant="ghost" size="sm" className="h-7 px-2 text-[9px]" disabled={busyServerId !== null} onClick={() => void testServer(server)}>{busyServerId === server.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Gauge className="mr-1 h-3 w-3" />}Test</Button><Button variant="ghost" size="sm" className="h-7 px-2 text-[9px]" disabled={busyServerId !== null} onClick={() => void refreshServer(server)}><RefreshCw className="mr-1 h-3 w-3" />Katalog</Button><Button variant="ghost" size="sm" className="h-7 px-2 text-[9px]" onClick={() => window.dispatchEvent(new CustomEvent('coreor:edit-server-modal', { detail: { serverId: server.id } }))}><Pencil className="mr-1 h-3 w-3" />Düzenle</Button><Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-[9px] text-red-400" onClick={() => void deleteServer(server)}><Trash2 className="mr-1 h-3 w-3" />Sil</Button></div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderAppearance = () => (
    <div className="space-y-4">
      <Section title="Uygulama teması" description="Tema bütün çalışma alanına anında uygulanır." icon={Palette}>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {appThemes.map(theme => <button key={theme.id} type="button" onClick={() => setPreferences({ theme: theme.id })} className={`rounded-xl border p-3 text-left transition ${preferences.theme === theme.id ? 'border-cyan-500/50 bg-cyan-500/[0.04] ring-1 ring-cyan-500/20' : 'border-zinc-800 hover:border-zinc-700'}`}><div className="mb-3 flex h-12 overflow-hidden rounded-lg border border-zinc-800">{theme.colors.map((color, index) => <span key={color} className="flex-1" style={{ backgroundColor: color, flexGrow: index === 2 ? 0.45 : 1 }} />)}</div><div className="flex items-center justify-between"><span className="text-[10px] font-semibold">{theme.title}</span>{preferences.theme === theme.id && <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400" />}</div><p className="mt-1 text-[8px] text-zinc-600">{theme.description}</p></button>)}
        </div>
      </Section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Tipografi ve yoğunluk" description="Arayüz, editör ve konsol ölçülerini ayrı ayrı yönetin." icon={Type}>
          <SettingRow title="Arayüz yazı ailesi" description="Menü, modal ve bilgi kartlarında kullanılır."><SearchSelect value={preferences.fontFamily} options={fontOptions} onValueChange={fontFamily => setPreferences({ fontFamily })} searchPlaceholder="Yazı ailesi ara…" /></SettingRow>
          <SettingRow title={`Arayüz yazısı • ${preferences.uiFontSize}px`} description="Genel arayüz metinlerinin boyutu."><input className={RANGE_CLASS} type="range" min="10" max="18" value={preferences.uiFontSize} onChange={event => setPreferences({ uiFontSize: Number(event.target.value) })} /></SettingRow>
          <SettingRow title={`SQL editörü • ${preferences.editorFontSize}px`} description="SQL ve Notebook kod alanları."><input className={RANGE_CLASS} type="range" min="10" max="28" value={preferences.editorFontSize} onChange={event => setPreferences({ editorFontSize: Number(event.target.value) })} /></SettingRow>
          <SettingRow title={`Konsol • ${preferences.consoleFontSize}px`} description="BottomBar SQL günlük satırları."><input className={RANGE_CLASS} type="range" min="8" max="18" value={preferences.consoleFontSize} onChange={event => setPreferences({ consoleFontSize: Number(event.target.value) })} /></SettingRow>
          <SettingRow title="Kompakt arayüz" description="Daha fazla veriyi aynı ekrana sığdırır."><CoreorSwitch checked={preferences.compactMode} onCheckedChange={compactMode => setPreferences({ compactMode })} compact /></SettingRow>
        </Section>
        <Section title="SQL syntax teması" description="Kod renklendirmesi arayüz temasından bağımsız seçilebilir." icon={Braces}>
          <div className="grid grid-cols-2 gap-2">{syntaxThemes.map(theme => <button key={theme.id} type="button" onClick={() => setPreferences({ syntaxTheme: theme.id })} className={`rounded-xl border p-3 text-left transition ${preferences.syntaxTheme === theme.id ? 'border-purple-500/50 bg-purple-500/10' : 'border-zinc-800 hover:border-zinc-700'}`}><div className="coreor-sql-editor rounded-lg border border-zinc-800 bg-black/30 p-3 font-mono text-[10px] leading-5"><span className="text-purple-300">SELECT</span> <span className="text-cyan-200">*</span><br /><span className="text-purple-300">FROM</span> users;</div><div className="mt-3 flex items-center justify-between"><span className="text-[10px] font-medium">{theme.label}</span>{preferences.syntaxTheme === theme.id && <CheckCircle2 className="h-3.5 w-3.5 text-purple-300" />}</div><p className="mt-1 text-[8px] text-zinc-600">{theme.description}</p></button>)}</div>
          <div className="mt-3 rounded-xl border border-zinc-800 bg-black/20 p-3"><div className="text-[9px] text-zinc-600">Canlı arayüz özeti</div><div className="mt-2 flex items-center gap-2"><span className="rounded bg-cyan-500/10 px-2 py-1 text-[9px] text-cyan-300">{preferences.theme}</span><span className="rounded bg-purple-500/10 px-2 py-1 text-[9px] text-purple-300">{preferences.syntaxTheme}</span><span className="rounded bg-zinc-900 px-2 py-1 text-[9px] text-zinc-500">{preferences.compactMode ? 'Kompakt' : 'Rahat'}</span></div></div>
        </Section>
      </div>
    </div>
  );

  const renderAccessibility = () => (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3"><StatCard label="Odak halkası" value={preferences.strongFocusRing ? 'Güçlü' : 'Standart'} detail="Klavye navigasyonu" tone={preferences.strongFocusRing ? 'success' : 'normal'} /><StatCard label="Hareket" value={preferences.reducedMotion ? 'Azaltılmış' : 'Normal'} detail="Animasyon davranışı" /><StatCard label="Renk filtresi" value={preferences.colorBlindMode === 'none' ? 'Kapalı' : preferences.colorBlindMode} detail="Arayüz renk dönüşümü" tone="cyan" /></div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Görsel erişilebilirlik" description="Odak, sınır ve metin okunabilirliğini kişiselleştirin." icon={Eye}>
          <SettingRow title="Güçlü odak halkası" description="Klavye odağını bütün etkileşimli alanlarda belirginleştirir."><CoreorSwitch checked={preferences.strongFocusRing} onCheckedChange={strongFocusRing => setPreferences({ strongFocusRing })} compact /></SettingRow>
          <SettingRow title="Yüksek kontrast sınırlar" description="Kart ve panel ayrımlarını daha keskin gösterir."><CoreorSwitch checked={preferences.highContrastBorders} onCheckedChange={highContrastBorders => setPreferences({ highContrastBorders })} compact /></SettingRow>
          <SettingRow title="Disleksi dostu harf aralığı" description="Metinlerde ek harf ve kelime boşluğu uygular."><CoreorSwitch checked={preferences.dyslexiaSpacing} onCheckedChange={dyslexiaSpacing => setPreferences({ dyslexiaSpacing })} compact /></SettingRow>
        </Section>
        <Section title="Hareket ve renk" description="Animasyon ve renk algısı seçenekleri." icon={Accessibility}>
          <SettingRow title="Animasyonları azalt" description="Geçiş ve hareket efektlerini minimuma indirir."><CoreorSwitch checked={preferences.reducedMotion} onCheckedChange={reducedMotion => setPreferences({ reducedMotion })} compact /></SettingRow>
          <SettingRow title="Renk körlüğü filtresi" description="Arayüz renklerini seçilen algı profiline dönüştürür."><SearchSelect value={preferences.colorBlindMode} options={colorBlindOptions} onValueChange={colorBlindMode => setPreferences({ colorBlindMode })} searchPlaceholder="Renk profili ara…" /></SettingRow>
          <div className="mt-3 grid grid-cols-5 gap-2">{['bg-red-400', 'bg-amber-400', 'bg-emerald-400', 'bg-cyan-400', 'bg-purple-400'].map(color => <span key={color} className={`h-10 rounded-lg border border-white/10 ${color}`} />)}</div>
          <p className="mt-2 text-[9px] leading-4 text-zinc-600">Üstteki renk örnekleri seçilen filtreyi anında önizler.</p>
        </Section>
      </div>
    </div>
  );

  const renderQuery = () => (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4"><StatCard label="Autocomplete" value={preferences.autocomplete ? 'Açık' : 'Kapalı'} detail="SQL önerileri" tone={preferences.autocomplete ? 'success' : 'normal'} /><StatCard label="Sonuç sınırı" value={preferences.queryResultLimit.toLocaleString('tr-TR')} detail="Tek sorguda en fazla" tone="cyan" /><StatCard label="Sidebar" value={`%${Math.round(preferences.sidebarSize)}`} detail="Çalışma alanı genişliği" /><StatCard label="Satır yüksekliği" value={preferences.lineHeight.toFixed(2)} detail="Editör okuma yoğunluğu" /></div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Sorgu davranışı" description="SQL yazma ve sonuç alma davranışları." icon={Terminal}>
          <SettingRow title="SQL autocomplete" description="Tablo, kolon, fonksiyon ve anahtar kelime önerileri."><CoreorSwitch checked={preferences.autocomplete} onCheckedChange={autocomplete => setPreferences({ autocomplete })} compact /></SettingRow>
          <SettingRow title="Yıkıcı sorgu doğrulaması" description="DROP, TRUNCATE ve koşulsuz DELETE için ek onay."><CoreorSwitch checked={preferences.confirmDangerousQueries} onCheckedChange={confirmDangerousQueries => setPreferences({ confirmDangerousQueries })} compact /></SettingRow>
          <SettingRow title="Varsayılan sonuç sınırı" description="Grid’e alınabilecek varsayılan maksimum satır."><SearchSelect value={String(preferences.queryResultLimit)} options={resultLimitOptions} onValueChange={value => setPreferences({ queryResultLimit: Number(value) })} searchPlaceholder="Satır sınırı ara…" /></SettingRow>
          <SettingRow title={`Editör satır yüksekliği • ${preferences.lineHeight.toFixed(2)}`} description="Uzun sorgularda satırlar arasındaki dikey boşluk."><input className={RANGE_CLASS} type="range" min="1.2" max="2.2" step="0.05" value={preferences.lineHeight} onChange={event => setPreferences({ lineHeight: Number(event.target.value) })} /></SettingRow>
        </Section>
        <Section title="Çalışma alanı" description="Panel ölçüsü ve yerleşim hafızası." icon={LayoutPanelLeft}>
          <SettingRow title={`Sidebar genişliği • %${Math.round(preferences.sidebarSize)}`} description="Sunucu ağacının başlangıç genişliği."><input className={RANGE_CLASS} type="range" min="12" max="45" value={preferences.sidebarSize} onChange={event => setPreferences({ sidebarSize: Number(event.target.value) })} /></SettingRow>
          <SettingRow title="Panel boyutlarını hatırla" description="Sürüklediğiniz sidebar genişliğini bu cihazda saklar."><CoreorSwitch checked={preferences.rememberPanelSizes} onCheckedChange={rememberPanelSizes => setPreferences({ rememberPanelSizes })} compact /></SettingRow>
          <div className="mt-3 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950"><div className="flex h-32"><div className="border-r border-cyan-500/20 bg-cyan-500/[0.05] p-3" style={{ width: `${Math.max(20, preferences.sidebarSize)}%` }}><div className="h-2 w-12 rounded bg-cyan-500/20" /><div className="mt-3 space-y-2">{[1, 2, 3].map(item => <div key={item} className="h-2 rounded bg-zinc-800" />)}</div></div><div className="flex-1 p-3"><div className="h-3 w-28 rounded bg-zinc-800" /><div className="mt-4 grid grid-cols-3 gap-2">{[1, 2, 3, 4, 5, 6].map(item => <div key={item} className="h-10 rounded bg-zinc-900" />)}</div></div></div></div>
        </Section>
      </div>
    </div>
  );

  const renderSecurity = () => (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3"><StatCard label="Oturum" value="NextAuth" detail="GitHub OAuth kimliği" tone="success" /><StatCard label="Kasa" value="AES-GCM" detail="Tarayıcı tarafı şifreleme" tone="cyan" /><StatCard label="SQL API" value="Same-origin" detail="Oturum ve hız sınırı" tone="success" /></div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="İstemci güvenliği" description="Riskli işlemler ve yerel profil koruması." icon={ShieldCheck}>
          <SettingRow title="Yıkıcı sorgularda onay" description="DROP, TRUNCATE ve koşulsuz DELETE işlemlerinde ikinci onay ister."><CoreorSwitch checked={preferences.confirmDangerousQueries} onCheckedChange={confirmDangerousQueries => setPreferences({ confirmDangerousQueries })} compact /></SettingRow>
          <div className="mt-3 space-y-2">{[
            ['Şifreli profil kasası', 'Sunucu profilleri hesap ve cihaz kapsamına bağlıdır.'],
            ['Parola maskeleme', 'Parolalar SQL günlüğü ve dışa aktarımlarda gösterilmez.'],
            ['İstek sınırları', 'Sorgu timeout, sonuç ve body boyutu sunucuda doğrulanır.']
          ].map(([title, text]) => <div key={title} className="flex items-start gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.035] p-3"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /><div><div className="text-[10px] font-medium text-emerald-100">{title}</div><div className="mt-1 text-[9px] leading-4 text-emerald-100/50">{text}</div></div></div>)}</div>
        </Section>
        <Section title="Sunucu erişim politikası" description="Dağıtım ortamındaki izin listesi ve API sınırları." icon={Wifi}>
          <div className="space-y-2 font-mono text-[9px] text-zinc-400">{[
            ['DATABASE_ALLOWED_HOSTS', 'Bağlanılabilecek host ve ağlar'],
            ['DATABASE_ALLOWED_PORTS', 'İzin verilen MySQL/MariaDB portları'],
            ['DATABASE_QUERY_TIMEOUT_MS', 'Sorguların en yüksek çalışma süresi'],
            ['DATABASE_MAX_RESULT_ROWS', 'Sunucudan dönebilecek en yüksek satır'],
            ['DATABASE_API_MAX_BODY_BYTES', 'İçe aktarma ve dosya istek boyutu']
          ].map(([key, text]) => <div key={key} className="rounded-xl border border-zinc-800 bg-black/20 p-3"><div className="text-cyan-300">{key}</div><div className="mt-1 font-sans text-[8px] text-zinc-600">{text}</div></div>)}</div>
        </Section>
      </div>
    </div>
  );

  const renderAdvanced = () => (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4"><StatCard label="Process yenileme" value={preferences.autoRefreshProcesses ? 'Otomatik' : 'Manuel'} detail="Canlı sorgu listesi" /><StatCard label="Aktarım paketi" value={preferences.importBatchSize} detail="Satır / batch" tone="cyan" /><StatCard label="Yerel tercih" value="v3" detail="Tarayıcı preference şeması" /><StatCard label="Uygulama" value="2.0.2" detail="UI polish sürümü" tone="success" /></div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Process ve aktarım" description="Yönetim ekranlarının yenileme ve paket davranışı." icon={Activity}>
          <SettingRow title="Process merkezini otomatik yenile" description="Açıkken process listesi belirli aralıklarla sunucudan tekrar okunur."><CoreorSwitch checked={preferences.autoRefreshProcesses} onCheckedChange={autoRefreshProcesses => setPreferences({ autoRefreshProcesses })} compact /></SettingRow>
          <SettingRow title="İçe aktarma batch boyutu" description="CSV ve JSON aktarımında tek istekte gönderilecek satır sayısı."><SearchSelect value={String(preferences.importBatchSize)} options={batchOptions} onValueChange={value => setPreferences({ importBatchSize: Number(value) })} searchPlaceholder="Batch boyutu ara…" /></SettingRow>
          <div className="mt-3 rounded-xl border border-zinc-800 bg-black/20 p-3"><div className="flex items-center gap-2 text-[10px] font-medium text-zinc-300"><Zap className="h-3.5 w-3.5 text-amber-400" />Performans notu</div><p className="mt-2 text-[9px] leading-4 text-zinc-600">Büyük batch değerleri hızlı ağlarda aktarımı hızlandırır; düşük bellekli veya uzak sunucularda daha küçük paketler daha kararlıdır.</p></div>
        </Section>
        <Section title="Yerel durum ve sıfırlama" description="Bu cihazda saklanan arayüz tercihlerini yönetin." icon={HardDrive}>
          <div className="grid grid-cols-2 gap-2"><div className="rounded-xl border border-zinc-800 p-3"><div className="text-[8px] text-zinc-600">Tema</div><div className="mt-1 text-[10px] font-medium text-zinc-200">{preferences.theme}</div></div><div className="rounded-xl border border-zinc-800 p-3"><div className="text-[8px] text-zinc-600">Syntax</div><div className="mt-1 text-[10px] font-medium text-zinc-200">{preferences.syntaxTheme}</div></div><div className="rounded-xl border border-zinc-800 p-3"><div className="text-[8px] text-zinc-600">Yoğunluk</div><div className="mt-1 text-[10px] font-medium text-zinc-200">{preferences.compactMode ? 'Kompakt' : 'Rahat'}</div></div><div className="rounded-xl border border-zinc-800 p-3"><div className="text-[8px] text-zinc-600">Sidebar</div><div className="mt-1 text-[10px] font-medium text-zinc-200">%{Math.round(preferences.sidebarSize)}</div></div></div>
          <div className="mt-4 rounded-xl border border-red-500/15 bg-red-500/[0.025] p-4"><div className="text-[10px] font-medium text-zinc-200">Uygulama tercihlerini sıfırla</div><p className="mt-1 text-[9px] leading-4 text-zinc-600">Tema, erişilebilirlik, sorgu ve panel tercihleri varsayılana döner. Sunucu kasası ve kayıtlı profiller silinmez.</p><Button variant="outline" size="sm" className="mt-4 h-8 border-red-500/20 text-[9px] text-red-300 hover:bg-red-500/10" onClick={resetPreferences}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Tercihleri sıfırla</Button></div>
        </Section>
      </div>
    </div>
  );

  const renderContent = () => {
    if (activeTab === 'account') return renderAccount();
    if (activeTab === 'servers') return renderServers();
    if (activeTab === 'appearance') return renderAppearance();
    if (activeTab === 'accessibility') return renderAccessibility();
    if (activeTab === 'query') return renderQuery();
    if (activeTab === 'security') return renderSecurity();
    if (activeTab === 'advanced') return renderAdvanced();
    return <ReleaseNotesTree compact />;
  };

  const activeTabInfo = tabs.find(tab => tab.id === activeTab);

  return createPortal(
    <div className="fixed inset-0 z-[335] flex items-center justify-center p-3 sm:p-4">
      <button type="button" aria-label="Ayarları kapat" className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative z-10 flex h-[min(900px,95vh)] w-[min(1440px,97vw)] min-h-0 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-800 bg-black/20">
          <div className="border-b border-zinc-800 p-4">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10"><Settings2 className="h-4 w-4 text-cyan-300" /></div><div><div className="text-sm font-semibold">Ayarlar</div><div className="mt-0.5 text-[9px] text-zinc-600">Coreor Database 2.0.2</div></div></div>
            <div className="relative mt-4"><Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-600" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Ayar veya sekme ara…" className="h-9 w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-9 pr-3 text-[10px] outline-none transition focus:border-cyan-500/40" /></div>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-2.5">
            {filteredTabs.map(tab => {
              const Icon = tab.icon;
              return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${activeTab === tab.id ? 'bg-cyan-500/10 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)]' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'}`}><span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${activeTab === tab.id ? 'border-cyan-500/30 bg-cyan-500/10' : 'border-zinc-800 bg-black/20'}`}><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-[11px] font-medium">{tab.label}</span><span className="mt-0.5 block truncate text-[8px] text-zinc-600">{tab.description}</span></span></button>;
            })}
            {filteredTabs.length === 0 && <div className="px-3 py-10 text-center text-[10px] text-zinc-600">Aramayla eşleşen ayar bulunamadı.</div>}
          </nav>
          <div className="border-t border-zinc-800 p-3"><div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3"><div className="flex items-center justify-between text-[9px]"><span className="text-zinc-600">Tercih durumu</span><span className="text-emerald-400">Kaydediliyor</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-900"><div className="h-full w-full bg-gradient-to-r from-cyan-500 to-emerald-500" /></div><p className="mt-2 text-[8px] leading-4 text-zinc-700">Değişiklikler bu cihazda anında uygulanır.</p></div></div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-zinc-800 px-5"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">{activeTabInfo?.label}</h2><span className="rounded-full border border-zinc-800 bg-black/20 px-2 py-0.5 text-[8px] text-zinc-600">2.0.2</span></div><p className="mt-1 truncate text-[9px] text-zinc-600">{activeTabInfo?.description}</p></div><Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={onClose}><X className="h-4 w-4" /></Button></header>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{renderContent()}</div>
        </main>
      </div>
    </div>,
    document.body
  );
}
