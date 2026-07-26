'use client';

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import {
  Accessibility,
  Building2,
  Code2,
  Database,
  Github,
  KeyRound,
  Laptop,
  Palette,
  RefreshCw,
  RotateCcw,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Wifi,
  X
} from 'lucide-react';
import type { AppFontFamily, AppThemeName, SyntaxThemeName } from '@/lib/appPreferences';
import { useAppPreferences } from '@/lib/appPreferences';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useAuth } from '@/context/AuthContext';
import { databaseEngineLabel } from '@/lib/databaseEngines';
import { ReleaseNotesTree } from '@/components/release-notes-tree';
import { OrganizationSettingsPanel } from '@/components/organization-settings-panel';
import { Button } from '@/components/ui/button';
import { CoreorSwitch } from '@/components/ui/coreor-switch';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
import { SqlCodeBlock } from '@/components/ui/sql-syntax';

export type DatabaseSettingsTab = 'account' | 'organizations' | 'servers' | 'appearance' | 'accessibility' | 'query' | 'security' | 'advanced' | 'whats-new';

interface DatabaseSettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: DatabaseSettingsTab;
}

type SettingsIcon = React.ComponentType<{ className?: string }>;
interface SettingsTabDefinition { id: DatabaseSettingsTab; label: string; description: string; icon: SettingsIcon }

const TABS: SettingsTabDefinition[] = [
  { id: 'account', label: 'Hesap', description: 'Profil, cihaz ve oturum', icon: UserRound },
  { id: 'organizations', label: 'Organizasyonlar', description: 'Ekip, rol ve veritabanları', icon: Building2 },
  { id: 'servers', label: 'Sunucular', description: 'Bağlantı kasası ve motorlar', icon: Server },
  { id: 'appearance', label: 'Görünüm', description: 'Tema, yazı ve SQL renkleri', icon: Palette },
  { id: 'accessibility', label: 'Erişilebilirlik', description: 'Odak ve hareket tercihleri', icon: Accessibility },
  { id: 'query', label: 'Sorgu editörü', description: 'Dry-run, öneriler ve sonuçlar', icon: Code2 },
  { id: 'security', label: 'Güvenlik', description: 'Snapshot ve onay akışları', icon: ShieldCheck },
  { id: 'advanced', label: 'Gelişmiş', description: 'Panel, aktarım ve yerel veri', icon: SlidersHorizontal },
  { id: 'whats-new', label: 'Yenilikler', description: 'Sürüm ve PR geçmişi', icon: Sparkles }
];

const THEME_OPTIONS: SearchSelectOption<AppThemeName>[] = [
  { value: 'amoled', label: 'AMOLED', description: 'Saf siyah, yüksek kontrast ve düşük ışık.', badge: 'Varsayılan' },
  { value: 'graphite', label: 'Graphite', description: 'Yumuşak kömür tonları ve dengeli kontrast.' },
  { value: 'midnight', label: 'Midnight', description: 'Lacivert ağırlıklı koyu çalışma alanı.' },
  { value: 'nord', label: 'Nord', description: 'Soğuk mavi ve gri renk paleti.' },
  { value: 'solarized', label: 'Solarized Dark', description: 'Düşük göz yorgunluğu için sıcak koyu tonlar.' },
  { value: 'light', label: 'Aydınlık', description: 'Gündüz kullanımına uygun açık görünüm.' },
  { value: 'high-contrast', label: 'Yüksek kontrast', description: 'Keskin sınırlar ve belirgin metinler.', badge: 'Erişilebilir' }
];

const SYNTAX_OPTIONS: SearchSelectOption<SyntaxThemeName>[] = [
  { value: 'coreor', label: 'Coreor Cyan', description: 'Cyan anahtar kelimeler ve yeşil metinler.', badge: 'Varsayılan' },
  { value: 'dracula', label: 'Dracula', description: 'Mor, pembe ve sarı vurgular.' },
  { value: 'nord', label: 'Nord Syntax', description: 'Soğuk mavi ve pastel tonlar.' },
  { value: 'monokai', label: 'Monokai', description: 'Canlı yeşil, pembe ve turuncu.' },
  { value: 'github-dark', label: 'GitHub Dark', description: 'GitHub koyu kod görünümü.' },
  { value: 'github-light', label: 'GitHub Light', description: 'Açık kod editörü renkleri.' }
];

const FONT_OPTIONS: SearchSelectOption<AppFontFamily>[] = [
  { value: 'system', label: 'Sistem UI', description: 'Windows, macOS veya Linux arayüz fontu.', badge: 'Önerilen' },
  { value: 'inter', label: 'Inter', description: 'Modern ve sıkı arayüz metinleri.' },
  { value: 'ibm-plex', label: 'IBM Plex Sans', description: 'Teknik paneller için açık karakter yapısı.' },
  { value: 'atkinson', label: 'Atkinson Hyperlegible', description: 'Benzer karakterleri kolay ayırt etmeye yardımcı olur.', badge: 'Erişilebilir' },
  { value: 'jetbrains', label: 'JetBrains Mono', description: 'SQL ve tablo değerleri için geliştirici fontu.' },
  { value: 'cascadia', label: 'Cascadia Code', description: 'Windows Terminal ile uyumlu kod fontu.' },
  { value: 'fira-code', label: 'Fira Code', description: 'Net semboller ve kod odaklı görünüm.' },
  { value: 'mono', label: 'Sistem Monospace', description: 'Yüklü varsayılan eşit genişlikli font.' },
  { value: 'serif', label: 'Serif', description: 'Uzun açıklamalar için klasik karakterler.' }
];

const COLOR_BLIND_OPTIONS = [
  { value: 'none', label: 'Standart renkler', description: 'Renk filtresi uygulanmaz.' },
  { value: 'protanopia', label: 'Protanopia desteği', description: 'Kırmızı ayrımını güçlendirir.' },
  { value: 'deuteranopia', label: 'Deuteranopia desteği', description: 'Yeşil ayrımını güçlendirir.' },
  { value: 'tritanopia', label: 'Tritanopia desteği', description: 'Mavi/sarı ayrımını güçlendirir.' }
] as const;

function SettingSection({ icon: Icon, title, description, children }: { icon: SettingsIcon; title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-zinc-800 bg-black/20 p-4 sm:p-5"><div className="mb-4 flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-cyan-400"><Icon className="h-4 w-4" /></span><div><h3 className="text-xs font-semibold">{title}</h3><p className="mt-1 text-[9px] leading-4 text-zinc-600">{description}</p></div></div>{children}</section>;
}

function SettingRow({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="grid min-h-16 items-center gap-3 border-b border-zinc-800/70 py-3 last:border-0 md:grid-cols-[minmax(180px,1fr)_minmax(320px,560px)]"><div><div className="text-[11px] font-medium text-zinc-200">{title}</div><div className="mt-1 text-[9px] leading-4 text-zinc-600">{description}</div></div><div className="min-w-0 w-full">{children}</div></div>;
}

function RangeControl({ value, min, max, step = 1, suffix = '', onChange }: { value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return <div className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2"><input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} className="coreor-range min-w-0 flex-1" /><span className="w-16 text-right font-mono text-[10px] text-cyan-300">{value}{suffix}</span></div>;
}

function MetricCard({ icon: Icon, label, value }: { icon: SettingsIcon; label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-zinc-800 bg-black/20 p-3"><div className="flex items-center gap-2 text-[8px] uppercase tracking-wider text-zinc-600"><Icon className="h-3.5 w-3.5 text-cyan-400" />{label}</div><div className="mt-2 truncate text-[11px] font-medium text-zinc-300">{value}</div></div>;
}

export function DatabaseSettingsModal({ open, onClose, initialTab = 'account' }: DatabaseSettingsModalProps) {
  const { data: session } = useSession();
  const { activeToken } = useAuth();
  const { preferences, setPreferences, resetPreferences } = useAppPreferences();
  const { servers, activeServerId, loadServers, isServersLoading } = useContext(DatabaseContext)!;
  const [tab, setTab] = useState<DatabaseSettingsTab>(initialTab);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);

  const activeServer = servers.find(server => server.id === activeServerId) || null;
  const totalDatabases = servers.reduce((total, server) => total + (server.databases?.length || 0), 0);
  const totalTables = servers.reduce((total, server) => total + (server.databases || []).reduce((sum, database) => sum + database.tableCount, 0), 0);
  const user = session?.user as (NonNullable<typeof session>['user'] & { id?: string }) | undefined;
  const deviceDetails = useMemo(() => typeof navigator === 'undefined'
    ? { platform: 'Sunucu', language: '—', online: true }
    : { platform: navigator.platform || 'Bilinmiyor', language: navigator.language, online: navigator.onLine }, [open]);

  if (!mounted || !open) return null;
  const activeTab = TABS.find(item => item.id === tab) || TABS[0];
  const ActiveTabIcon = activeTab.icon;

  return createPortal(<div className="fixed inset-0 z-[340] flex items-center justify-center p-2 sm:p-4"><button type="button" className="absolute inset-0 bg-black/80 backdrop-blur-md" aria-label="Kapat" onClick={onClose} /><div className="relative z-10 grid h-[min(880px,calc(100dvh-24px))] w-[min(1460px,calc(100vw-24px))] grid-cols-[250px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
    <aside className="flex min-h-0 flex-col border-r border-zinc-800 bg-black/25"><div className="border-b border-zinc-800 p-4"><div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-cyan-400" /><div><div className="text-xs font-semibold">Ayarlar</div><div className="mt-0.5 text-[8px] text-zinc-600">Coreor Database v2.1.1</div></div></div></div><nav className="coreor-scroll-frame min-h-0 flex-1 overflow-y-auto p-2">{TABS.map(item => { const Icon = item.icon; const active = tab === item.id; return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`mb-1 flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${active ? 'border border-cyan-500/20 bg-cyan-500/10' : 'border border-transparent hover:bg-white/[0.035]'}`}><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'text-cyan-300' : 'text-zinc-600'}`} /><span className="min-w-0"><span className={`block text-[10px] font-medium ${active ? 'text-zinc-100' : 'text-zinc-400'}`}>{item.label}</span><span className="mt-0.5 block text-[8px] leading-4 text-zinc-600">{item.description}</span></span></button>; })}</nav><div className="border-t border-zinc-800 p-3"><Button variant="ghost" size="sm" className="w-full justify-start text-[10px] text-zinc-500" onClick={resetPreferences}><RotateCcw className="mr-2 h-3.5 w-3.5" />Tercihleri sıfırla</Button></div></aside>

    <main className="flex min-h-0 flex-col"><header className="flex h-16 shrink-0 items-center gap-3 border-b border-zinc-800 px-5"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-black/20"><ActiveTabIcon className="h-4 w-4 text-cyan-400" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{activeTab.label}</h2><p className="mt-0.5 text-[9px] text-zinc-600">{activeTab.description}</p></div><Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button></header>
      <div className="coreor-scroll-frame min-h-0 flex-1 overflow-auto p-4 sm:p-5">
        {tab === 'account' && <div className="space-y-4"><section className="rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-cyan-500/[0.07] via-transparent to-purple-500/[0.05] p-5"><div className="flex flex-wrap items-center gap-4">{user?.image ? <img src={user.image} alt="" className="h-16 w-16 rounded-2xl border border-zinc-700 bg-zinc-900 object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-900"><UserRound className="h-7 w-7 text-zinc-500" /></div>}<div className="min-w-0 flex-1"><h3 className="truncate text-lg font-semibold">{user?.name || 'Coreor kullanıcısı'}</h3><div className="mt-1 truncate text-[10px] text-zinc-500">{user?.email || 'E-posta paylaşılmadı'}</div><div className="mt-2 flex flex-wrap gap-2"><span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[8px] text-emerald-300"><Github className="h-3 w-3" />GitHub hesabı</span><span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[8px] text-cyan-300"><KeyRound className="h-3 w-3" />Şifreli kasa açık</span></div></div></div><div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><MetricCard icon={Github} label="Hesap kimliği" value={user?.id || activeToken?.slice(0, 12) || '—'} /><MetricCard icon={Laptop} label="Cihaz" value={deviceDetails.platform} /><MetricCard icon={Wifi} label="Dil" value={deviceDetails.language} /><MetricCard icon={ShieldCheck} label="Ağ" value={deviceDetails.online ? 'Bağlı' : 'Çevrimdışı'} /></div></section><div className="grid gap-4 lg:grid-cols-2"><SettingSection icon={KeyRound} title="Yerel şifreli kasa" description="Bağlantı parolaları kullanıcı hesabına bağlı tarayıcı kasasında saklanır."><div className="grid grid-cols-3 gap-2"><MetricCard icon={Server} label="Sunucu" value={servers.length} /><MetricCard icon={Database} label="Veritabanı" value={totalDatabases} /><MetricCard icon={Code2} label="Tablo" value={totalTables} /></div></SettingSection><SettingSection icon={ShieldCheck} title="Oturum güvenliği" description="API çağrıları same-origin ve NextAuth oturumu üzerinden doğrulanır."><div className="space-y-2 text-[10px] text-zinc-500"><div className="rounded-lg border border-zinc-800 p-3">GitHub oturumu: <span className="text-emerald-300">{user ? 'Aktif' : 'Kapalı'}</span></div><div className="rounded-lg border border-zinc-800 p-3">Aktif motor: <span className="text-zinc-300">{activeServer ? databaseEngineLabel(activeServer.databaseType) : '—'}</span></div></div></SettingSection></div></div>}

        {tab === 'organizations' && <OrganizationSettingsPanel accountEmail={user?.email} />}

        {tab === 'servers' && <div className="space-y-4"><section className="grid gap-3 sm:grid-cols-3"><MetricCard icon={Server} label="Sunucu profili" value={servers.length} /><MetricCard icon={Database} label="Veritabanı" value={totalDatabases} /><MetricCard icon={Code2} label="Tablo" value={totalTables} /></section><SettingSection icon={Server} title="Şifreli bağlantı kasası" description="Bağlantıları düzenleyin, motorlarını görün ve kataloglarını yenileyin."><div className="space-y-2">{servers.map(server => <div key={server.id} className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${activeServerId === server.id ? 'border-cyan-500/25 bg-cyan-500/[0.04]' : 'border-zinc-800 bg-zinc-950/50'}`}><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-black/20"><Server className="h-4 w-4 text-emerald-400" /></span><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-medium">{server.name}</div><div className="mt-1 truncate font-mono text-[9px] text-zinc-600">{server.host}:{server.port} • {server.username}</div></div><span className="rounded-full bg-zinc-900 px-2 py-1 text-[8px] text-zinc-400">{databaseEngineLabel(server.databaseType)} {server.version}</span><span className="text-[9px] text-zinc-600">{server.databases?.length || 0} DB</span><Button variant="ghost" size="sm" className="text-[9px]" onClick={() => window.dispatchEvent(new CustomEvent('coreor:edit-server-modal', { detail: { serverId: server.id } }))}>Düzenle</Button></div>)}{!servers.length && <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-[10px] text-zinc-600">Henüz bağlantı profili yok.</div>}</div><Button variant="outline" size="sm" className="mt-4" disabled={isServersLoading} onClick={() => void loadServers()}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isServersLoading ? 'animate-spin' : ''}`} />Kasayı yenile</Button></SettingSection></div>}

        {tab === 'appearance' && <div className="space-y-4"><SettingSection icon={Palette} title="Tema ve renk sistemi" description="Seçimler anında bütün çalışma alanına uygulanır."><SettingRow title="Uygulama teması" description="Arka plan, panel, sınır ve temel metin renkleri."><SearchSelect value={preferences.theme} options={THEME_OPTIONS} onValueChange={theme => setPreferences({ theme })} dropdownMinWidth={600} dropdownMaxWidth={760} /></SettingRow><SettingRow title="SQL syntax teması" description="Anahtar kelime, string, sayı, yorum, tip ve fonksiyon renkleri."><SearchSelect value={preferences.syntaxTheme} options={SYNTAX_OPTIONS} onValueChange={syntaxTheme => setPreferences({ syntaxTheme })} dropdownMinWidth={600} dropdownMaxWidth={760} /></SettingRow><SettingRow title="Arayüz ve SQL fontu" description="Yüklü değilse işletim sistemi güvenli yedek fontu kullanılır."><SearchSelect value={preferences.fontFamily} options={FONT_OPTIONS} onValueChange={fontFamily => setPreferences({ fontFamily })} dropdownMinWidth={600} dropdownMaxWidth={760} /></SettingRow><SettingRow title="Arayüz yazı boyutu" description="Menü, grid ve modal metinleri."><RangeControl value={preferences.uiFontSize} min={10} max={18} suffix=" px" onChange={uiFontSize => setPreferences({ uiFontSize })} /></SettingRow><SettingRow title="SQL editörü boyutu" description="Sorgu yazma alanı ve syntax katmanı."><RangeControl value={preferences.editorFontSize} min={10} max={28} suffix=" px" onChange={editorFontSize => setPreferences({ editorFontSize })} /></SettingRow><SettingRow title="Konsol yazı boyutu" description="Alt SQL günlüğü ve işlem ayrıntıları."><RangeControl value={preferences.consoleFontSize} min={8} max={18} suffix=" px" onChange={consoleFontSize => setPreferences({ consoleFontSize })} /></SettingRow><SettingRow title="Satır yüksekliği" description="Kod ve uzun metinlerin dikey aralığı."><RangeControl value={preferences.lineHeight} min={1.2} max={2.2} step={0.05} onChange={lineHeight => setPreferences({ lineHeight })} /></SettingRow></SettingSection><section className="rounded-2xl border border-zinc-800 bg-[var(--coreor-editor-bg)] p-5"><div className="text-[9px] uppercase tracking-wider text-zinc-600">Canlı SQL önizlemesi</div><SqlCodeBlock className="mt-4" sql={`SELECT u.id, u.email\nFROM users AS u\nWHERE u.status = 'active'\nLIMIT 100;`} /></section></div>}

        {tab === 'accessibility' && <SettingSection icon={Accessibility} title="Erişilebilirlik tercihleri" description="Hareket, kontrast ve odak görünürlüğünü kişiselleştirin."><SettingRow title="Hareketi azalt" description="Animasyon ve geçiş sürelerini minimuma indirir."><CoreorSwitch checked={preferences.reducedMotion} onCheckedChange={reducedMotion => setPreferences({ reducedMotion })} label="Azaltılmış hareket" /></SettingRow><SettingRow title="Güçlü odak halkası" description="Klavye navigasyonunda aktif kontrolü daha belirgin yapar."><CoreorSwitch checked={preferences.strongFocusRing} onCheckedChange={strongFocusRing => setPreferences({ strongFocusRing })} label="Odak halkasını güçlendir" /></SettingRow><SettingRow title="Yüksek kontrast sınırlar" description="Panel ve grid kenarlarını belirginleştirir."><CoreorSwitch checked={preferences.highContrastBorders} onCheckedChange={highContrastBorders => setPreferences({ highContrastBorders })} label="Belirgin sınırlar" /></SettingRow><SettingRow title="Disleksi aralığı" description="Harf ve kelime aralıklarını artırır."><CoreorSwitch checked={preferences.dyslexiaSpacing} onCheckedChange={dyslexiaSpacing => setPreferences({ dyslexiaSpacing })} label="Okuma aralığını artır" /></SettingRow><SettingRow title="Renk körlüğü profili" description="Durum ve vurgu renklerini seçilen profile göre değiştirir."><SearchSelect value={preferences.colorBlindMode} options={[...COLOR_BLIND_OPTIONS]} onValueChange={colorBlindMode => setPreferences({ colorBlindMode })} dropdownMinWidth={600} dropdownMaxWidth={760} /></SettingRow></SettingSection>}

        {tab === 'query' && <SettingSection icon={Code2} title="Sorgu editörü" description="Autocomplete, dry-run ve sonuç davranışları."><SettingRow title="SQL autocomplete" description="Anahtar kelime, veritabanı, tablo ve kolon önerileri gösterir."><CoreorSwitch checked={preferences.autocomplete} onCheckedChange={autocomplete => setPreferences({ autocomplete })} label="Önerileri etkinleştir" /></SettingRow><SettingRow title="UPDATE/DELETE dry-run" description="Çalıştırmadan önce etkilenecek satır sayısını ve ilk 100 kaydı ön izler. Varsayılan olarak açıktır."><CoreorSwitch checked={preferences.sqlDryRun} onCheckedChange={sqlDryRun => setPreferences({ sqlDryRun })} label="Dry-run ön izlemesi" /></SettingRow><SettingRow title="Tehlikeli sorgu onayı" description="Koşulsuz UPDATE/DELETE ve diğer riskli sorgular için yazılı onay ister."><CoreorSwitch checked={preferences.confirmDangerousQueries} onCheckedChange={confirmDangerousQueries => setPreferences({ confirmDangerousQueries })} label="Onay iste" /></SettingRow><SettingRow title="Sonuç satır sınırı" description="Tek result set içinde tarayıcıya dönebilecek en yüksek kayıt."><SearchSelect value={String(preferences.queryResultLimit)} options={[100, 500, 1000, 2500, 5000, 10000, 25000, 50000].map(value => ({ value: String(value), label: `${value.toLocaleString('tr-TR')} satır`, description: value <= 5000 ? 'Hızlı ve güvenli sonuç boyutu' : 'Büyük sonuç; tarayıcı belleğini artırır' }))} onValueChange={value => setPreferences({ queryResultLimit: Number(value) })} dropdownMinWidth={520} /></SettingRow></SettingSection>}

        {tab === 'security' && <div className="space-y-4"><SettingSection icon={ShieldCheck} title="Şema ve işlem güvenliği" description="ALTER geçmişi, migration ve ikinci kullanıcı onayı."><SettingRow title="Otomatik şema snapshot’ı" description="Her görsel ALTER öncesinde CREATE SQL, kolonlar, indeksler ve foreign key’ler localStorage geçmişine yazılır."><CoreorSwitch checked={preferences.schemaSnapshots} onCheckedChange={schemaSnapshots => setPreferences({ schemaSnapshots })} label="Snapshot al" /></SettingRow><SettingRow title="İkinci kullanıcı onayı" description="DROP, TRUNCATE ve production olarak adlandırılmış sunuculardaki ALTER işlemlerini approval kuyruğuna gönderir."><CoreorSwitch checked={preferences.approvalWorkflows} onCheckedChange={approvalWorkflows => setPreferences({ approvalWorkflows })} label="Onay akışını zorunlu kıl" /></SettingRow><SettingRow title="Tehlikeli sorgu onayı" description="SQL editöründeki riskli işlemler için ek yazılı doğrulama."><CoreorSwitch checked={preferences.confirmDangerousQueries} onCheckedChange={confirmDangerousQueries => setPreferences({ confirmDangerousQueries })} label="Yazılı onay" /></SettingRow></SettingSection><SettingSection icon={ShieldCheck} title="Güvenlik katmanları" description="Oturum, kasa ve sunucu erişim politikaları."><div className="grid gap-3 md:grid-cols-2">{[['NextAuth oturumu', user ? 'Aktif ve doğrulanmış' : 'Oturum yok'], ['Tarayıcı kasası', `${servers.length} şifreli profil`], ['TLS varsayılanı', activeServer?.sslMode || 'required'], ['API origin koruması', 'Same-origin zorunlu'], ['Host allowlist', 'Sunucu ortam değişkeni'], ['İstek hız sınırı', 'Dakikada 120 istek']].map(([label, value]) => <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3"><div className="text-[9px] text-zinc-600">{label}</div><div className="mt-1 text-[10px] font-medium text-zinc-300">{value}</div></div>)}</div></SettingSection></div>}

        {tab === 'advanced' && <SettingSection icon={SlidersHorizontal} title="Gelişmiş çalışma alanı" description="Yerleşim, aktarım ve canlı merkez davranışları."><SettingRow title="Kompakt mod" description="Grid, araç çubuğu ve modal aralıklarını azaltır."><CoreorSwitch checked={preferences.compactMode} onCheckedChange={compactMode => setPreferences({ compactMode })} label="Kompakt arayüz" /></SettingRow><SettingRow title="Sidebar genişliği" description="Sol veritabanı ağacının ekran yüzdesi."><RangeControl value={preferences.sidebarSize} min={12} max={45} suffix="%" onChange={sidebarSize => setPreferences({ sidebarSize })} /></SettingRow><SettingRow title="Panel boyutlarını hatırla" description="Sidebar ve çalışma alanı oranlarını localStorage içinde saklar."><CoreorSwitch checked={preferences.rememberPanelSizes} onCheckedChange={rememberPanelSizes => setPreferences({ rememberPanelSizes })} label="Yerleşimi koru" /></SettingRow><SettingRow title="Process otomatik yenileme" description="Process merkezi açıkken arka planda periyodik yenileme."><CoreorSwitch checked={preferences.autoRefreshProcesses} onCheckedChange={autoRefreshProcesses => setPreferences({ autoRefreshProcesses })} label="Otomatik yenile" /></SettingRow><SettingRow title="İçe aktarma batch boyutu" description="CSV/JSON aktarımındaki tek işlem kayıt sayısı."><SearchSelect value={String(preferences.importBatchSize)} options={[25, 50, 100, 250, 500, 1000].map(value => ({ value: String(value), label: `${value} kayıt`, description: value <= 250 ? 'Dengeli bellek ve hız' : 'Daha hızlı; daha fazla bellek' }))} onValueChange={value => setPreferences({ importBatchSize: Number(value) })} dropdownMinWidth={500} /></SettingRow></SettingSection>}

        {tab === 'whats-new' && <ReleaseNotesTree compact />}
      </div>
    </main>
  </div></div>, document.body);
}
