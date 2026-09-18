'use client';

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Accessibility,
  BellRing,
  BrainCircuit,
  Building2,
  Code2,
  Database,
  GitBranch,
  KeyRound,
  Laptop,
  LockKeyhole,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Wifi,
  Trash2,
  X
} from 'lucide-react';
import type { AppFontFamily, AppThemeName, PerformanceRefreshSeconds, SyntaxThemeName } from '@/lib/appPreferences';
import { useAppPreferences } from '@/lib/appPreferences';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useDesktop } from '@/context/DesktopContext';
import { databaseEngineLabel } from '@/lib/databaseEngines';
import { ReleaseNotesTree } from '@/components/release-notes-tree';
import { OrganizationSettingsPanel } from '@/components/organization-settings-panel';
import { Button } from '@/components/ui/button';
import { CoreorSwitch } from '@/components/ui/coreor-switch';
import { CoreorConfirmModal, type CoreorConfirmation } from '@/components/ui/coreor-confirm-modal';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';

export type DatabaseSettingsTab = 'account' | 'organizations' | 'servers' | 'appearance' | 'accessibility' | 'query' | 'security' | 'advanced' | 'whats-new';
type SettingsIcon = React.ComponentType<{ className?: string }>;

interface DatabaseSettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: DatabaseSettingsTab;
}

const TABS: Array<{ id: DatabaseSettingsTab; label: string; description: string; icon: SettingsIcon }> = [
  { id: 'account', label: 'Yerel', description: 'Cihaz ve yerel çalışma alanı', icon: UserRound },
  { id: 'organizations', label: 'Organizasyonlar', description: 'Ekip, rol ve veritabanları', icon: Building2 },
  { id: 'servers', label: 'Sunucular', description: 'Bağlantı kasası ve motorlar', icon: Server },
  { id: 'appearance', label: 'Görünüm', description: 'Tema, font ve SQL renkleri', icon: Palette },
  { id: 'accessibility', label: 'Erişilebilirlik', description: 'Odak, kontrast ve hareket', icon: Accessibility },
  { id: 'query', label: 'Sorgu editörü', description: 'Dil servisi, dry-run ve sonuçlar', icon: Code2 },
  { id: 'security', label: 'Güvenlik', description: 'Snapshot, readonly ve ikinci onay', icon: ShieldCheck },
  { id: 'advanced', label: 'Gelişmiş', description: 'Canlı takip, alarm ve yerel veri', icon: SlidersHorizontal },
  { id: 'whats-new', label: 'Yenilikler', description: 'Sürüm ve PR geçmişi', icon: Sparkles }
];

const THEME_OPTIONS: SearchSelectOption<AppThemeName>[] = [
  { value: 'amoled', label: 'AMOLED', description: 'Saf siyah ve yüksek kontrast', badge: 'Varsayılan' },
  { value: 'graphite', label: 'Graphite', description: 'Yumuşak kömür tonları' },
  { value: 'midnight', label: 'Midnight', description: 'Lacivert koyu görünüm' },
  { value: 'nord', label: 'Nord', description: 'Soğuk mavi ve gri' },
  { value: 'solarized', label: 'Solarized Dark', description: 'Sıcak düşük kontrast' },
  { value: 'light', label: 'Aydınlık', description: 'Gündüz kullanımı' },
  { value: 'high-contrast', label: 'Yüksek kontrast', description: 'Erişilebilir keskin görünüm' }
];
const SYNTAX_OPTIONS: SearchSelectOption<SyntaxThemeName>[] = [
  { value: 'coreor', label: 'Coreor Cyan', description: 'Cyan, yeşil ve mor vurgular' },
  { value: 'dracula', label: 'Dracula', description: 'Mor ve pembe vurgular' },
  { value: 'nord', label: 'Nord Syntax', description: 'Pastel mavi tonları' },
  { value: 'monokai', label: 'Monokai', description: 'Canlı klasik kod renkleri' },
  { value: 'github-dark', label: 'GitHub Dark', description: 'GitHub koyu görünüm' },
  { value: 'github-light', label: 'GitHub Light', description: 'Açık kod görünümü' }
];
const FONT_OPTIONS: SearchSelectOption<AppFontFamily>[] = [
  { value: 'system', label: 'Sistem UI', description: 'İşletim sisteminin arayüz fontu' },
  { value: 'inter', label: 'Inter', description: 'Yoğun tablolarda dengeli sans-serif' },
  { value: 'geist', label: 'Geist', description: 'Modern ve kompakt arayüz karakteri' },
  { value: 'mono', label: 'Sistem Monospace', description: 'Bütün arayüzde eşit genişlik' },
  { value: 'cascadia', label: 'Cascadia Code', description: 'Windows ve SQL için okunaklı monospace' },
  { value: 'fira-code', label: 'Fira Code', description: 'Kod ligatürlü geliştirici fontu' },
  { value: 'humanist', label: 'Humanist', description: 'Atkinson/Verdana tabanlı okunaklı görünüm' },
  { value: 'serif', label: 'Serif', description: 'Uzun açıklamalar için klasik karakter' }
];
const REFRESH_OPTIONS: SearchSelectOption<PerformanceRefreshSeconds>[] = [1, 3, 5, 10, 15, 30].map(value => ({
  value: value as PerformanceRefreshSeconds,
  label: `${value} saniye`,
  description: value <= 3 ? 'Çok canlı; daha fazla durum sorgusu üretir.' : value <= 10 ? 'Dengeli canlı takip.' : 'Daha düşük veritabanı yükü.',
  badge: value === 5 ? 'Varsayılan' : undefined
}));

function Section({ icon: Icon, title, description, children }: { icon: SettingsIcon; title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-zinc-800 bg-black/20 p-5"><div className="mb-4 flex gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950"><Icon className="h-4 w-4 text-cyan-400" /></span><div><h3 className="text-xs font-semibold">{title}</h3><p className="mt-1 text-[9px] text-zinc-600">{description}</p></div></div>{children}</section>;
}
function Row({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="grid min-h-16 items-center gap-3 border-b border-zinc-800/70 py-3 last:border-0 md:grid-cols-[minmax(190px,1fr)_minmax(340px,560px)]"><div><div className="text-[11px] font-medium">{title}</div><div className="mt-1 text-[9px] leading-4 text-zinc-600">{description}</div></div><div className="min-w-0">{children}</div></div>;
}
function Range({ value, min, max, step = 1, suffix = '', onChange }: { value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2"><input className="coreor-range min-w-0 flex-1" type="range" value={value} min={min} max={max} step={step} onChange={event => onChange(Number(event.target.value))} /><span className="w-16 text-right font-mono text-[10px] text-cyan-300">{value}{suffix}</span></div>;
}

export function DatabaseSettingsModal({ open, onClose, initialTab = 'account' }: DatabaseSettingsModalProps) {
  const { workspaceKey, user } = useDesktop();
  const { preferences, setPreferences, resetPreferences } = useAppPreferences();
  const { servers, activeServerId, setActiveServerId, removeServer, loadServers, isServersLoading } = useContext(DatabaseContext)!;
  const [tab, setTab] = useState<DatabaseSettingsTab>(initialTab);
  const [mounted, setMounted] = useState(false);
  const [profileConfirmation, setProfileConfirmation] = useState<CoreorConfirmation | null>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
  const activeServer = servers.find(server => server.id === activeServerId) || null;
  const totalDatabases = servers.reduce((sum, server) => sum + (server.databases?.length || 0), 0);
  const totalTables = servers.reduce((sum, server) => sum + (server.databases || []).reduce((value, database) => value + database.tableCount, 0), 0);
  const device = useMemo(() => (typeof navigator === 'undefined' ? { platform: 'Sunucu', language: '—', online: true } : { platform: navigator.platform || 'Bilinmiyor', language: navigator.language, online: navigator.onLine }), [open]);
  if (!mounted || !open) return null;
  const activeTab = TABS.find(item => item.id === tab) || TABS[0];
  const ActiveIcon = activeTab.icon;

  return createPortal(
    <div className="fixed inset-0 z-[340] flex items-center justify-center p-3">
      <button className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative z-10 grid h-[min(880px,calc(100dvh-24px))] w-[min(1440px,calc(100vw-24px))] grid-cols-[255px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <aside className="flex min-h-0 flex-col border-r border-zinc-800 bg-black/25">
          <div className="border-b border-zinc-800 p-4"><div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-cyan-400" /><div><div className="text-xs font-semibold">Ayarlar</div><div className="text-[8px] text-zinc-600">Coreor Database v3.0.0</div></div></div></div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-2">{TABS.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={`mb-1 flex w-full gap-3 rounded-xl border px-3 py-2.5 text-left ${tab === item.id ? 'border-cyan-500/20 bg-cyan-500/10' : 'border-transparent hover:bg-white/[0.035]'}`}><Icon className={`mt-0.5 h-4 w-4 ${tab === item.id ? 'text-cyan-300' : 'text-zinc-600'}`} /><span><span className="block text-[10px] font-medium">{item.label}</span><span className="mt-0.5 block text-[8px] text-zinc-600">{item.description}</span></span></button>; })}</nav>
          <div className="border-t border-zinc-800 p-3"><Button variant="ghost" size="sm" className="w-full justify-start" onClick={resetPreferences}><RotateCcw className="mr-2 h-3.5 w-3.5" />Tercihleri sıfırla</Button></div>
        </aside>
        <main className="flex min-h-0 flex-col">
          <header className="flex h-16 items-center gap-3 border-b border-zinc-800 px-5"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800"><ActiveIcon className="h-4 w-4 text-cyan-400" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{activeTab.label}</h2><p className="text-[9px] text-zinc-600">{activeTab.description}</p></div><Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button></header>
          <div className="coreor-table-scroll min-h-0 flex-1 overflow-auto p-5">
            {tab === 'account' && <div className="space-y-4"><section className="rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-cyan-500/[0.07] via-transparent to-purple-500/[0.05] p-5"><div className="flex items-center gap-4">{user?.image ? <img src={user.image} alt="" className="h-16 w-16 rounded-2xl border border-zinc-700 object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-700"><UserRound className="h-7 w-7" /></div>}<div><h3 className="text-lg font-semibold">{user?.name || 'Coreor kullanıcısı'}</h3><div className="text-[10px] text-zinc-500">{user?.email || 'E-posta paylaşılmadı'}</div></div></div><div className="mt-5 grid gap-2 sm:grid-cols-4">{[
              { icon: GitBranch, label: 'Hesap', value: user?.id || workspaceKey?.slice(0, 12) || '—' },
              { icon: Laptop, label: 'Cihaz', value: device.platform },
              { icon: Wifi, label: 'Dil', value: device.language },
              { icon: ShieldCheck, label: 'Ağ', value: device.online ? 'Bağlı' : 'Çevrimdışı' }
            ].map(item => { const Icon = item.icon; return <div key={item.label} className="rounded-xl border border-zinc-800 bg-black/20 p-3"><div className="flex items-center gap-2 text-[8px] text-zinc-600"><Icon className="h-3 w-3" />{item.label}</div><div className="mt-1 truncate text-[10px]">{item.value}</div></div>; })}</div></section><Section icon={KeyRound} title="Yerel çalışma alanı" description="Bu bilgisayarda saklanan bağlantı ve uygulama bilgileri."><Row title="Yerel bağlantı config" description="Bağlantı profilleri Tauri uygulama config dizinindeki config.json içinde tutulur."><div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] px-3 py-2 text-[10px] text-cyan-300">{servers.length} profil • {totalDatabases} veritabanı • {totalTables} tablo</div></Row><Row title="Organizasyonlar" description="Ekip rolleri ve veritabanı bağları."><Button variant="outline" className="w-full justify-between" onClick={() => setTab('organizations')}>Organizasyonları yönet<Building2 className="h-4 w-4" /></Button></Row></Section></div>}
            {tab === 'organizations' && <OrganizationSettingsPanel accountEmail={user?.email} />}
            {tab === 'servers' && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3">{[
              { icon: Server, label: 'Sunucu', value: servers.length }, { icon: Database, label: 'Veritabanı', value: totalDatabases }, { icon: Code2, label: 'Tablo', value: totalTables }
            ].map(item => { const Icon = item.icon; return <div key={item.label} className="rounded-2xl border border-zinc-800 p-4"><div className="flex items-center gap-2 text-[9px] text-zinc-600"><Icon className="h-4 w-4 text-cyan-400" />{item.label}</div><div className="mt-2 text-2xl font-semibold">{item.value}</div></div>; })}</div><Section icon={Server} title="Bağlantı profilleri" description="Yerel bağlantıları düzenleyin, etkinleştirin veya bu cihazdan kaldırın."><div className="space-y-2">{servers.map(server => <div key={server.id} className={`flex items-center gap-3 rounded-xl border p-3 ${server.id === activeServerId ? 'border-cyan-500/25 bg-cyan-500/[0.04]' : 'border-zinc-800'}`}><Server className="h-4 w-4 shrink-0 text-emerald-400" /><button type="button" className="min-w-0 flex-1 text-left" onClick={() => setActiveServerId(server.id)}><div className="flex items-center gap-2"><span className="truncate text-[11px] font-medium">{server.name}</span>{server.id === activeServerId && <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[7px] text-cyan-300">AKTİF</span>}</div><div className="mt-0.5 font-mono text-[9px] text-zinc-600">{server.host}:{server.port} • {databaseEngineLabel(server.databaseType)} {server.version}</div><div className="mt-1 text-[8px] text-zinc-600">{server.databases?.length || 0} veritabanı • {(server.databases || []).reduce((sum, database) => sum + database.tableCount, 0)} tablo</div></button>{server.readOnly && <span className="rounded bg-amber-500/10 px-2 py-1 text-[8px] text-amber-300">READ ONLY</span>}<div className="flex shrink-0 items-center gap-1"><Button variant="ghost" size="icon" className="h-8 w-8" title="Bağlantıyı düzenle" onClick={() => window.dispatchEvent(new CustomEvent('coreor:edit-server-modal', { detail: { serverId: server.id } }))}><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8" title="Profili kaldır" onClick={() => setProfileConfirmation({ title: 'Bağlantı profilini kaldır', description: `"${server.name}" profili yalnızca bu cihazdaki bağlantı kasasından kaldırılacak. Uzak veritabanı sunucusundaki hiçbir veri silinmez.`, confirmLabel: 'Profili kaldır', tone: 'danger', onConfirm: () => removeServer(server.id) })}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button></div></div>)}</div><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new Event('coreor:open-server-modal'))}><Plus className="mr-2 h-3.5 w-3.5" />Yeni bağlantı</Button><Button variant="outline" size="sm" disabled={isServersLoading} onClick={() => void loadServers()}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${isServersLoading ? 'animate-spin' : ''}`} />Kasayı yenile</Button></div></Section></div>}
            {tab === 'appearance' && <Section icon={Palette} title="Tema ve font" description="Arayüz ve SQL editörü için ortak görünüm."><Row title="Uygulama teması" description="Bütün panel ve modal renkleri."><SearchSelect value={preferences.theme} options={THEME_OPTIONS} onValueChange={theme => setPreferences({ theme })} dropdownMinWidth={600} /></Row><Row title="SQL syntax teması" description="Anahtar kelime, string ve yorum renkleri."><SearchSelect value={preferences.syntaxTheme} options={SYNTAX_OPTIONS} onValueChange={syntaxTheme => setPreferences({ syntaxTheme })} dropdownMinWidth={600} /></Row><Row title="Font ailesi" description="Tablo, menü ve editör okunabilirliği."><SearchSelect value={preferences.fontFamily} options={FONT_OPTIONS} onValueChange={fontFamily => setPreferences({ fontFamily })} dropdownMinWidth={620} /></Row><Row title="Arayüz boyutu" description="Genel UI metin boyutu."><Range value={preferences.uiFontSize} min={10} max={18} suffix=" px" onChange={uiFontSize => setPreferences({ uiFontSize })} /></Row><Row title="SQL editörü" description="Syntax katmanı ve caret metrikleri."><Range value={preferences.editorFontSize} min={10} max={28} suffix=" px" onChange={editorFontSize => setPreferences({ editorFontSize })} /></Row><Row title="Konsol" description="Alt günlük yazı boyutu."><Range value={preferences.consoleFontSize} min={8} max={18} suffix=" px" onChange={consoleFontSize => setPreferences({ consoleFontSize })} /></Row><Row title="Satır yüksekliği" description="Üst üste binmeyi önleyen dikey metrik."><Range value={preferences.lineHeight} min={1.25} max={2} step={0.05} onChange={lineHeight => setPreferences({ lineHeight })} /></Row></Section>}
            {tab === 'accessibility' && <Section icon={Accessibility} title="Erişilebilirlik" description="Hareket, kontrast ve odak görünürlüğü."><Row title="Hareketi azalt" description="Animasyonları minimuma indirir."><CoreorSwitch checked={preferences.reducedMotion} onCheckedChange={reducedMotion => setPreferences({ reducedMotion })} label="Azaltılmış hareket" /></Row><Row title="Güçlü odak" description="Klavye odağını belirginleştirir."><CoreorSwitch checked={preferences.strongFocusRing} onCheckedChange={strongFocusRing => setPreferences({ strongFocusRing })} label="Odak halkası" /></Row><Row title="Yüksek kontrast sınırlar" description="Grid ve panel kenarlarını güçlendirir."><CoreorSwitch checked={preferences.highContrastBorders} onCheckedChange={highContrastBorders => setPreferences({ highContrastBorders })} label="Belirgin sınırlar" /></Row></Section>}
            {tab === 'query' && <Section icon={Code2} title="Sorgu güvenliği ve dil servisi" description="Tarayıcı içi SQL analizi, değişiklik ön izlemesi ve sonuç sınırları."><Row title="Sorgu oturumunu hatırla" description="Açık sorgu sekmelerini, SQL metinlerini ve varsa son gösterilen sonucu uygulama kapatılıp açıldığında geri yükler."><CoreorSwitch checked={preferences.rememberQueryWorkspace} onCheckedChange={rememberQueryWorkspace => setPreferences({ rememberQueryWorkspace })} label="Sorgu sekmelerini geri yükle" /></Row><Row title="SQL autocomplete" description="Veritabanı, tablo, kolon ve keyword önerileri."><CoreorSwitch checked={preferences.autocomplete} onCheckedChange={autocomplete => setPreferences({ autocomplete })} label="Önerileri etkinleştir" /></Row><Row title="Yerel SQL language server" description="Alias, tablo, kolon, motor syntaxı, eksik WHERE ve belirsiz kolon uyarıları sorgu editöründe otomatik çalışır."><div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2 text-[10px] text-emerald-300">Etkin • merkezi sunucu gerekmez</div></Row><Row title="UPDATE/DELETE dry-run" description="Sorgudan önce aynı WHERE koşuluyla etkilenecek ilk 250 satırı gösterir."><CoreorSwitch checked={preferences.dryRunMutations} onCheckedChange={dryRunMutations => setPreferences({ dryRunMutations })} label="Dry-run ön izlemesi" /></Row><Row title="Tehlikeli sorgu onayı" description="Veri veya şema kaybı riski olan sorgularda yazılı doğrulama."><CoreorSwitch checked={preferences.confirmDangerousQueries} onCheckedChange={confirmDangerousQueries => setPreferences({ confirmDangerousQueries })} label="Onay iste" /></Row><Row title="Sonuç satır sınırı" description="Tek sonuç setinin azami satır sayısı."><SearchSelect value={String(preferences.queryResultLimit)} options={[100, 500, 1000, 2500, 5000, 10000, 25000, 50000].map(value => ({ value: String(value), label: `${value.toLocaleString('tr-TR')} satır` }))} onValueChange={value => setPreferences({ queryResultLimit: Number(value) })} /></Row></Section>}
            {tab === 'security' && <div className="space-y-4"><Section icon={ShieldCheck} title="Şema ve kritik işlem koruması" description="ALTER, DROP, TRUNCATE ve bağlantı yazma politikaları."><Row title="Otomatik şema snapshot" description="Her ALTER TABLE öncesinde tablo yapısını yerel geçmişe kaydeder."><CoreorSwitch checked={preferences.autoSchemaSnapshots} onCheckedChange={autoSchemaSnapshots => setPreferences({ autoSchemaSnapshots })} label="Snapshot al" /></Row><Row title="İkinci kullanıcı onayı" description="DROP ve TRUNCATE işlemlerini onay merkezine gönderir."><CoreorSwitch checked={preferences.requireSecondApproval} onCheckedChange={requireSecondApproval => setPreferences({ requireSecondApproval })} label="İkinci onay zorunlu" /></Row><Row title="Production ALTER onayı" description="ALTER TABLE işlemlerini de ikinci onay akışına dahil eder."><CoreorSwitch checked={preferences.productionAlterApproval} onCheckedChange={productionAlterApproval => setPreferences({ productionAlterApproval })} label="ALTER için onay" /></Row><Row title="Yeni profiller salt-okunur" description="Yeni sunucu ekleme formu varsayılan olarak READ ONLY açılır. Profil içinde ayrıca değiştirilebilir."><CoreorSwitch checked={preferences.defaultReadOnlyConnections} onCheckedChange={defaultReadOnlyConnections => setPreferences({ defaultReadOnlyConnections })} label="Varsayılan salt-okunur" /></Row><Row title="Onay merkezini aç" description="Bekleyen, onaylanan ve reddedilen talepleri yönetin."><Button variant="outline" className="w-full" onClick={() => window.dispatchEvent(new CustomEvent('coreor:open-automation-center', { detail: { tab: 'approvals' } }))}>Onay akışlarını yönet</Button></Row></Section>{activeServer?.readOnly && <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-4 text-[10px] leading-5 text-amber-100"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0"/><div><b>{activeServer.name}</b> salt-okunur. Bu politika arayüz kontrollerine ek olarak native Rust/Tauri veritabanı katmanında da uygulanır.</div></div>}</div>}
            {tab === 'advanced' && <div className="space-y-4"><Section icon={BellRing} title="Canlı takip ve bildirimler" description="Ölçümler ve alarm kuralları yalnızca bu cihazda tutulur."><Row title="Anlık bildirimler" description="Aktif MySQL/MariaDB/TiDB sunucusunu izler ve eşik aşımında sağ üst toast gösterir."><CoreorSwitch checked={preferences.liveNotifications} onCheckedChange={liveNotifications => setPreferences({ liveNotifications })} label="Canlı alarm monitörü" /></Row><Row title="Performans yenileme" description="Canlı panel ve alarm monitörünün ölçüm aralığı."><SearchSelect value={preferences.performanceRefreshSeconds} options={REFRESH_OPTIONS} onValueChange={performanceRefreshSeconds => setPreferences({ performanceRefreshSeconds })} dropdownMinWidth={480} /></Row><Row title="Alarm kuralları" description="Bağlantı, thread, slow query, buffer pool, replication ve sağlık eşiklerini düzenleyin."><Button variant="outline" className="w-full" onClick={() => window.dispatchEvent(new CustomEvent('coreor:open-intelligence-center', { detail: { tab: 'alerts' } }))}>Alarm merkezini aç</Button></Row></Section><Section icon={BrainCircuit} title="Merkeziyetsiz veri zekâsı" description="Profiler, slow query, sağlık, maskeleme, test verisi, kalite ve snippetler."><Row title="Veri Zekâsı merkezi" description="Analiz sonuçları, maskeler ve şablonlar tarayıcıda kalır."><Button variant="outline" className="w-full" onClick={() => window.dispatchEvent(new CustomEvent('coreor:open-intelligence-center', { detail: { tab: 'profiler' } }))}>Veri Zekâsı merkezini aç</Button></Row><Row title="Kompakt mod" description="Daha fazla satır ve panel gösterir."><CoreorSwitch checked={preferences.compactMode} onCheckedChange={compactMode => setPreferences({ compactMode })} label="Kompakt görünüm" /></Row><Row title="Panel boyutlarını hatırla" description="Sidebar ve çalışma alanı oranlarını saklar."><CoreorSwitch checked={preferences.rememberPanelSizes} onCheckedChange={rememberPanelSizes => setPreferences({ rememberPanelSizes })} label="Yerleşimi sakla" /></Row><Row title="Process otomatik yenileme" description="Process merkezini arka planda günceller."><CoreorSwitch checked={preferences.autoRefreshProcesses} onCheckedChange={autoRefreshProcesses => setPreferences({ autoRefreshProcesses })} label="Otomatik yenile" /></Row><Row title="Operasyon merkezi" description="Migration, yedekleme, prepared lab, karşılaştırma ve maskeleme."><Button variant="outline" className="w-full" onClick={() => window.dispatchEvent(new CustomEvent('coreor:open-automation-center', { detail: { tab: 'history' } }))}>Operasyon merkezini aç</Button></Row></Section></div>}
            {tab === 'whats-new' && <ReleaseNotesTree compact />}
          </div>
        </main>
      </div>
      <CoreorConfirmModal action={profileConfirmation} onClose={() => setProfileConfirmation(null)} />
    </div>,
    document.body
  );
}
