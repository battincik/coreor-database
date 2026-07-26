'use client';

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import {
  Accessibility,
  CheckCircle2,
  Database,
  Eye,
  Gauge,
  KeyRound,
  Loader2,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  User,
  X,
  XCircle
} from 'lucide-react';
import type { DatabaseServerConfig } from 'types';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useAuth } from '@/context/AuthContext';
import { fetchServerTables, testStoredDatabaseConnection } from '@/lib/databaseApi';
import { writeEncryptedServerProfiles } from '@/lib/secureVault';
import { useAppPreferences, type AppThemeName, type SyntaxThemeName } from '@/lib/appPreferences';
import type { OpenSettingsModalDetail } from '@/lib/databaseToolEvents';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  { id: 'account', label: 'Hesap', description: 'GitHub oturumu ve şifreli kasa', icon: User },
  { id: 'servers', label: 'Sunucular', description: 'Bağlantı profilleri ve katalog', icon: Server },
  { id: 'appearance', label: 'Görünüm', description: 'Tema, font ve yoğunluk', icon: Monitor },
  { id: 'accessibility', label: 'Erişilebilirlik', description: 'Kontrast, hareket ve odak', icon: Accessibility },
  { id: 'query', label: 'Sorgu editörü', description: 'Autocomplete ve sonuç sınırları', icon: Terminal },
  { id: 'security', label: 'Güvenlik', description: 'Onaylar ve bağlantı koruması', icon: ShieldCheck },
  { id: 'advanced', label: 'Gelişmiş', description: 'Process, aktarım ve panel davranışı', icon: Settings2 },
  { id: 'whats-new', label: 'Yenilikler', description: 'Bütün sürümler ve pull request geçmişi', icon: Sparkles }
];

const appThemes: Array<{ id: AppThemeName; title: string; colors: string[] }> = [
  { id: 'amoled', title: 'AMOLED', colors: ['#000000', '#09090b', '#22d3ee'] },
  { id: 'graphite', title: 'Graphite', colors: ['#13151a', '#27272a', '#38bdf8'] },
  { id: 'midnight', title: 'Midnight', colors: ['#0b1020', '#171d34', '#a78bfa'] },
  { id: 'nord', title: 'Nord', colors: ['#2e3440', '#3b4252', '#88c0d0'] },
  { id: 'solarized', title: 'Solarized', colors: ['#002b36', '#073642', '#2aa198'] },
  { id: 'light', title: 'Aydınlık', colors: ['#f8fafc', '#ffffff', '#0ea5e9'] },
  { id: 'high-contrast', title: 'Yüksek Kontrast', colors: ['#000000', '#ffffff', '#fff200'] }
];

const syntaxThemes: Array<{ id: SyntaxThemeName; label: string }> = [
  { id: 'coreor', label: 'Coreor Cyan' },
  { id: 'dracula', label: 'Dracula' },
  { id: 'nord', label: 'Nord' },
  { id: 'monokai', label: 'Monokai' },
  { id: 'github-dark', label: 'GitHub Dark' },
  { id: 'github-light', label: 'GitHub Light' }
];

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
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center gap-4 border-b border-zinc-800/70 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-zinc-200">{title}</div>
        {description && <div className="mt-1 text-[10px] leading-4 text-zinc-600">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Section({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-black/20 p-4">
      <div className="mb-3">
        <h3 className="text-xs font-semibold text-zinc-100">{title}</h3>
        {description && <p className="mt-1 text-[10px] leading-4 text-zinc-600">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function formatServer(server: DatabaseServerConfig) {
  return `${server.host || 'host yok'}:${server.port || 3306}`;
}

export function DatabaseSettingsModal({
  open,
  onClose,
  initialTab = 'account'
}: DatabaseSettingsModalProps) {
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

  const {
    servers,
    activeServerId,
    setActiveServerId,
    loadServers,
    isServersLoading
  } = databaseContext;
  const user = session?.user;

  const testServer = async (server: DatabaseServerConfig) => {
    if (!activeToken || busyServerId) return;
    setBusyServerId(server.id);
    try {
      const result = await testStoredDatabaseConnection(server.id, activeToken);
      setServerStatus(previous => ({
        ...previous,
        [server.id]: { tone: 'success', text: result.connection?.version || 'Bağlantı başarılı' }
      }));
    } catch (error) {
      setServerStatus(previous => ({
        ...previous,
        [server.id]: { tone: 'error', text: error instanceof Error ? error.message : 'Bağlantı başarısız' }
      }));
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
      setServerStatus(previous => ({
        ...previous,
        [server.id]: { tone: 'success', text: 'Katalog yenilendi' }
      }));
    } catch (error) {
      setServerStatus(previous => ({
        ...previous,
        [server.id]: { tone: 'error', text: error instanceof Error ? error.message : 'Katalog yenilenemedi' }
      }));
    } finally {
      setBusyServerId(null);
    }
  };

  const deleteServer = async (server: DatabaseServerConfig) => {
    if (!activeToken || !window.confirm(`${server.name} bağlantısı bu cihazdaki şifreli kasadan silinsin mi?`)) return;
    await writeEncryptedServerProfiles(activeToken, servers.filter(item => item.id !== server.id));
    if (activeServerId === server.id) {
      setActiveServerId(servers.find(item => item.id !== server.id)?.id || null);
    }
    await loadServers();
  };

  const renderAccount = () => (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="GitHub hesabı" description="Kimlik bilgileri NextAuth oturumundan okunur.">
        <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-black/20 p-4">
          <Avatar className="h-14 w-14 border border-zinc-700">
            <AvatarImage src={user?.image || undefined} alt={user?.name || 'Coreor kullanıcısı'} />
            <AvatarFallback>{initials(user?.name, user?.email)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{user?.name || 'Coreor kullanıcısı'}</div>
            <div className="truncate text-xs text-zinc-500">{user?.email || 'E-posta paylaşılmadı'}</div>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />Oturum açık
            </div>
          </div>
        </div>
      </Section>
      <Section title="Şifreli tarayıcı kasası" description="Sunucu profilleri bu cihazda AES-GCM ile saklanır.">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-zinc-800 p-4">
            <div className="text-2xl font-semibold">{servers.length}</div>
            <div className="mt-1 text-[10px] text-zinc-600">Kayıtlı sunucu</div>
          </div>
          <div className="rounded-xl border border-zinc-800 p-4">
            <div className="text-2xl font-semibold">{servers.reduce((total, server) => total + (server.databases?.length || 0), 0)}</div>
            <div className="mt-1 text-[10px] text-zinc-600">Önbellekte veritabanı</div>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.05] p-3 text-[10px] leading-5 text-cyan-100">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />Bağlantı parolaları uygulama sunucusunda kalıcı tutulmaz; yalnızca istek anında çözülür.
        </div>
      </Section>
    </div>
  );

  const renderServers = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="text-sm font-semibold">Sunucu profilleri</h3><p className="mt-1 text-[10px] text-zinc-600">Ekleme, düzenleme, test, katalog yenileme ve silme işlemleri.</p></div>
        <Button size="sm" className="h-8 text-[10px]" onClick={() => window.dispatchEvent(new Event('coreor:open-server-modal'))}><Plus className="mr-1.5 h-3.5 w-3.5" />Sunucu ekle</Button>
      </div>
      {isServersLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 py-14 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Şifreli kasa yükleniyor…</div>
      ) : servers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 py-14 text-center"><Server className="mx-auto h-8 w-8 text-zinc-700" /><div className="mt-3 text-sm text-zinc-400">Henüz sunucu eklenmedi.</div></div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {servers.map(server => {
            const status = serverStatus[server.id];
            return (
              <article key={server.id} className={`rounded-xl border p-4 ${activeServerId === server.id ? 'border-cyan-500/40 bg-cyan-500/[0.04]' : 'border-zinc-800 bg-black/20'}`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950"><Database className="h-4 w-4 text-emerald-400" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <button type="button" className="truncate text-left text-xs font-semibold" onClick={() => setActiveServerId(server.id)}>{server.name}</button>
                      {activeServerId === server.id && <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[8px] text-cyan-300">AKTİF</span>}
                    </div>
                    <div className="mt-1 truncate font-mono text-[10px] text-zinc-600">{formatServer(server)} • {server.databaseType || 'mysql'} {server.version || ''}</div>
                    <div className="mt-1 text-[9px] text-zinc-700">{server.databases?.length || 0} veritabanı • TLS {server.sslMode || 'required'}</div>
                  </div>
                </div>
                {status && <div className={`mt-3 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[9px] ${status.tone === 'success' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{status.tone === 'success' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}<span className="truncate">{status.text}</span></div>}
                <div className="mt-3 flex flex-wrap gap-1">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[9px]" disabled={busyServerId !== null} onClick={() => void testServer(server)}>{busyServerId === server.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Gauge className="mr-1 h-3 w-3" />}Test</Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[9px]" disabled={busyServerId !== null} onClick={() => void refreshServer(server)}><RefreshCw className="mr-1 h-3 w-3" />Katalog</Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[9px]" onClick={() => window.dispatchEvent(new CustomEvent('coreor:edit-server-modal', { detail: { serverId: server.id } }))}><Pencil className="mr-1 h-3 w-3" />Düzenle</Button>
                  <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-[9px] text-red-400" onClick={() => void deleteServer(server)}><Trash2 className="mr-1 h-3 w-3" />Sil</Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderAppearance = () => (
    <div className="space-y-4">
      <Section title="Uygulama teması">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {appThemes.map(theme => (
            <button key={theme.id} type="button" onClick={() => setPreferences({ theme: theme.id })} className={`rounded-xl border p-3 text-left ${preferences.theme === theme.id ? 'border-cyan-500/50 ring-1 ring-cyan-500/20' : 'border-zinc-800'}`}>
              <div className="mb-2 flex h-10 overflow-hidden rounded border border-zinc-800">{theme.colors.map((color, index) => <span key={color} className="flex-1" style={{ backgroundColor: color, flexGrow: index === 2 ? 0.45 : 1 }} />)}</div>
              <span className="text-[10px] font-medium">{theme.title}</span>
            </button>
          ))}
        </div>
      </Section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Yazı ve yoğunluk">
          <SettingRow title={`Arayüz yazısı: ${preferences.uiFontSize}px`}><input type="range" min="10" max="18" value={preferences.uiFontSize} onChange={event => setPreferences({ uiFontSize: Number(event.target.value) })} /></SettingRow>
          <SettingRow title={`SQL editörü: ${preferences.editorFontSize}px`}><input type="range" min="10" max="28" value={preferences.editorFontSize} onChange={event => setPreferences({ editorFontSize: Number(event.target.value) })} /></SettingRow>
          <SettingRow title={`Konsol: ${preferences.consoleFontSize}px`}><input type="range" min="8" max="18" value={preferences.consoleFontSize} onChange={event => setPreferences({ consoleFontSize: Number(event.target.value) })} /></SettingRow>
          <SettingRow title="Kompakt arayüz"><input type="checkbox" checked={preferences.compactMode} onChange={event => setPreferences({ compactMode: event.target.checked })} /></SettingRow>
        </Section>
        <Section title="SQL syntax teması">
          <div className="grid grid-cols-2 gap-2">
            {syntaxThemes.map(theme => <button key={theme.id} type="button" onClick={() => setPreferences({ syntaxTheme: theme.id })} className={`rounded-lg border p-2 text-left text-[10px] ${preferences.syntaxTheme === theme.id ? 'border-purple-500/50 bg-purple-500/10' : 'border-zinc-800'}`}><div className="coreor-sql-editor rounded p-2 font-mono">SELECT * FROM users;</div><div className="mt-2">{theme.label}</div></button>)}
          </div>
        </Section>
      </div>
    </div>
  );

  const renderAccessibility = () => (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Görsel erişilebilirlik">
        <SettingRow title="Güçlü odak halkası" description="Klavye odağını daha belirgin gösterir."><input type="checkbox" checked={preferences.strongFocusRing} onChange={event => setPreferences({ strongFocusRing: event.target.checked })} /></SettingRow>
        <SettingRow title="Yüksek kontrast sınırlar"><input type="checkbox" checked={preferences.highContrastBorders} onChange={event => setPreferences({ highContrastBorders: event.target.checked })} /></SettingRow>
        <SettingRow title="Disleksi dostu harf aralığı"><input type="checkbox" checked={preferences.dyslexiaSpacing} onChange={event => setPreferences({ dyslexiaSpacing: event.target.checked })} /></SettingRow>
      </Section>
      <Section title="Hareket ve renk">
        <SettingRow title="Animasyonları azalt"><input type="checkbox" checked={preferences.reducedMotion} onChange={event => setPreferences({ reducedMotion: event.target.checked })} /></SettingRow>
        <SettingRow title="Renk körlüğü filtresi"><select value={preferences.colorBlindMode} onChange={event => setPreferences({ colorBlindMode: event.target.value as typeof preferences.colorBlindMode })} className="h-8 rounded border border-zinc-800 bg-zinc-950 px-2 text-[10px]"><option value="none">Kapalı</option><option value="protanopia">Protanopia</option><option value="deuteranopia">Deuteranopia</option><option value="tritanopia">Tritanopia</option></select></SettingRow>
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-zinc-800 p-3 text-[10px] text-zinc-500"><Eye className="h-4 w-4 shrink-0" />Ayarlar anında bütün editör çalışma alanına uygulanır.</div>
      </Section>
    </div>
  );

  const renderQuery = () => (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Sorgu editörü">
        <SettingRow title="SQL autocomplete" description="Tablo, kolon ve anahtar kelime önerileri."><input type="checkbox" checked={preferences.autocomplete} onChange={event => setPreferences({ autocomplete: event.target.checked })} /></SettingRow>
        <SettingRow title="Tehlikeli sorgu doğrulaması"><input type="checkbox" checked={preferences.confirmDangerousQueries} onChange={event => setPreferences({ confirmDangerousQueries: event.target.checked })} /></SettingRow>
        <SettingRow title="Varsayılan sonuç sınırı"><select value={preferences.queryResultLimit} onChange={event => setPreferences({ queryResultLimit: Number(event.target.value) })} className="h-8 rounded border border-zinc-800 bg-zinc-950 px-2 text-[10px]"><option value="500">500</option><option value="1000">1.000</option><option value="5000">5.000</option><option value="10000">10.000</option><option value="50000">50.000</option></select></SettingRow>
      </Section>
      <Section title="Çalışma alanı">
        <SettingRow title={`Sidebar genişliği: %${Math.round(preferences.sidebarSize)}`}><input type="range" min="12" max="45" value={preferences.sidebarSize} onChange={event => setPreferences({ sidebarSize: Number(event.target.value) })} /></SettingRow>
        <SettingRow title="Panel boyutlarını hatırla"><input type="checkbox" checked={preferences.rememberPanelSizes} onChange={event => setPreferences({ rememberPanelSizes: event.target.checked })} /></SettingRow>
      </Section>
    </div>
  );

  const renderSecurity = () => (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="İstemci güvenliği">
        <SettingRow title="Yıkıcı sorgularda onay" description="DROP, TRUNCATE ve koşulsuz DELETE işlemlerinde ek onay."><input type="checkbox" checked={preferences.confirmDangerousQueries} onChange={event => setPreferences({ confirmDangerousQueries: event.target.checked })} /></SettingRow>
        <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3 text-[10px] leading-5 text-emerald-100"><ShieldCheck className="mb-2 h-4 w-4" />Bağlantı profilleri hesap kimliğine bağlı şifreli kasada saklanır. SQL API same-origin ve NextAuth kontrolünden geçer.</div>
      </Section>
      <Section title="Sunucu erişim politikası">
        <div className="space-y-2 font-mono text-[10px] text-zinc-400"><div className="rounded-lg border border-zinc-800 p-3">DATABASE_ALLOWED_HOSTS</div><div className="rounded-lg border border-zinc-800 p-3">DATABASE_ALLOWED_PORTS</div><div className="rounded-lg border border-zinc-800 p-3">DATABASE_QUERY_TIMEOUT_MS</div></div>
        <p className="mt-3 text-[10px] leading-5 text-zinc-600">Özel ağ adresleri yalnızca sunucu ortamındaki allowlist üzerinden kullanılabilir.</p>
      </Section>
    </div>
  );

  const renderAdvanced = () => (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Process ve aktarım">
        <SettingRow title="Process merkezini otomatik yenile"><input type="checkbox" checked={preferences.autoRefreshProcesses} onChange={event => setPreferences({ autoRefreshProcesses: event.target.checked })} /></SettingRow>
        <SettingRow title="İçe aktarma batch boyutu"><select value={preferences.importBatchSize} onChange={event => setPreferences({ importBatchSize: Number(event.target.value) })} className="h-8 rounded border border-zinc-800 bg-zinc-950 px-2 text-[10px]"><option value="25">25</option><option value="100">100</option><option value="250">250</option><option value="500">500</option><option value="1000">1.000</option></select></SettingRow>
      </Section>
      <Section title="Sıfırlama">
        <p className="text-[10px] leading-5 text-zinc-600">Tema, erişilebilirlik, sorgu ve panel tercihlerini fabrika varsayılanlarına döndürür. Sunucu kasası silinmez.</p>
        <Button variant="outline" size="sm" className="mt-4 h-8 text-[10px]" onClick={resetPreferences}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Uygulama tercihlerini sıfırla</Button>
      </Section>
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

  return createPortal(
    <div className="fixed inset-0 z-[335] flex items-center justify-center p-4">
      <button type="button" aria-label="Ayarları kapat" className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-[min(860px,94vh)] w-[min(1320px,96vw)] min-h-0 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-black/20">
          <div className="border-b border-zinc-800 p-3">
            <div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-cyan-400" /><div><div className="text-xs font-semibold">Ayarlar</div><div className="text-[9px] text-zinc-600">Coreor Database 2.0.1</div></div></div>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Ayar ara…" className="mt-3 h-8 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 text-[10px] outline-none focus:border-cyan-500/40" />
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-2">
            {filteredTabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${activeTab === tab.id ? 'bg-cyan-500/10 text-cyan-100' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'}`}>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${activeTab === tab.id ? 'border-cyan-500/30 bg-cyan-500/10' : 'border-zinc-800 bg-black/20'}`}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0"><span className="block text-[11px] font-medium">{tab.label}</span><span className="mt-0.5 block truncate text-[9px] text-zinc-600">{tab.description}</span></span>
                </button>
              );
            })}
          </nav>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 px-4">
            <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{tabs.find(tab => tab.id === activeTab)?.label}</h2><p className="truncate text-[9px] text-zinc-600">{tabs.find(tab => tab.id === activeTab)?.description}</p></div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{renderContent()}</div>
        </main>
      </div>
    </div>,
    document.body
  );
}
