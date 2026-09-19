'use client';

import { useModalEscape } from '@/lib/useModalEscape';
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
import { useAuth } from '@/context/AuthContext';
import { databaseEngineLabel } from '@/lib/databaseEngines';
import { detectPlatform, shortcutLabel, type ShortcutId } from '@/lib/shortcuts';
import { platformDisplayName, useNativePlatform } from '@/lib/platformRuntime';
import { readLocalVaultStatus, type LocalVaultStatus } from '@/lib/desktopClient';
import { ReleaseNotesTree } from '@/components/release-notes-tree';
import { OrganizationSettingsPanel } from '@/components/organization-settings-panel';
import { Button } from '@/components/ui/button';
import { CoreorSwitch } from '@/components/ui/coreor-switch';
import { CoreorConfirmModal, type CoreorConfirmation } from '@/components/ui/coreor-confirm-modal';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
import { useLanguage } from '@/context/LanguageContext';

export type DatabaseSettingsTab = 'account' | 'organizations' | 'servers' | 'appearance' | 'accessibility' | 'query' | 'security' | 'advanced' | 'whats-new';
type SettingsIcon = React.ComponentType<{ className?: string }>;

interface DatabaseSettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: DatabaseSettingsTab;
}

const TABS: Array<{ id: DatabaseSettingsTab; labelKey: string; descriptionKey: string; icon: SettingsIcon }> = [
  { id:'account', labelKey:'settingsCatalog.tabs.local', descriptionKey:'settingsCatalog.tabs.localDescription', icon:UserRound },
  { id:'organizations', labelKey:'settingsCatalog.tabs.organizations', descriptionKey:'settingsCatalog.tabs.organizationsDescription', icon:Building2 },
  { id:'servers', labelKey:'settingsCatalog.tabs.servers', descriptionKey:'settingsCatalog.tabs.serversDescription', icon:Server },
  { id:'appearance', labelKey:'settingsCatalog.tabs.appearance', descriptionKey:'settingsCatalog.tabs.appearanceDescription', icon:Palette },
  { id:'accessibility', labelKey:'settingsCatalog.tabs.accessibility', descriptionKey:'settingsCatalog.accessibility.description', icon:Accessibility },
  { id:'query', labelKey:'settingsCatalog.tabs.query', descriptionKey:'settingsCatalog.tabs.queryDescription', icon:Code2 },
  { id:'security', labelKey:'settingsCatalog.tabs.security', descriptionKey:'settingsCatalog.tabs.securityDescription', icon:ShieldCheck },
  { id:'advanced', labelKey:'settingsCatalog.tabs.advanced', descriptionKey:'settingsCatalog.tabs.advancedDescription', icon:SlidersHorizontal },
  { id:'whats-new', labelKey:'settingsCatalog.tabs.about', descriptionKey:'settingsCatalog.tabs.aboutDescription', icon:Sparkles }
];
const THEME_DEFS = [
  ['amoled','AMOLED','settingsCatalog.themes.amoledDescription'],
  ['graphite','Graphite','settingsCatalog.themes.charcoalDescription'],
  ['midnight','Midnight','settingsCatalog.themes.navyDescription'],
  ['nord','Nord','settingsCatalog.themes.coldDescription'],
  ['solarized','Solarized Dark','settingsCatalog.themes.warmDescription'],
  ['light','settingsCatalog.themes.light','settingsCatalog.themes.lightDescription'],
  ['high-contrast','settingsCatalog.themes.highContrast','settingsCatalog.themes.highContrastDescription']
] as const;
const SYNTAX_DEFS = [
  ['coreor','Coreor Cyan','settingsCatalog.themes.syntaxCyanDescription'],
  ['dracula','Dracula','settingsCatalog.themes.syntaxDraculaDescription'],
  ['nord','Nord Syntax','settingsCatalog.themes.syntaxPastelDescription'],
  ['monokai','Monokai','settingsCatalog.themes.syntaxClassicDescription'],
  ['github-dark','GitHub Dark','settingsCatalog.themes.syntaxGithubDescription'],
  ['github-light','GitHub Light','settingsCatalog.themes.syntaxLightDescription']
] as const;
const FONT_DEFS = [
  ['system','settingsCatalog.fonts.systemUi','settingsCatalog.fonts.systemDescription'],
  ['inter','Inter','settingsCatalog.fonts.sansDescription'],
  ['geist','Geist','settingsCatalog.fonts.modernDescription'],
  ['mono','settingsCatalog.fonts.systemMono','settingsCatalog.fonts.monoDescription'],
  ['cascadia','Cascadia Code','settingsCatalog.fonts.cascadiaDescription'],
  ['fira-code','Fira Code','settingsCatalog.fonts.firaDescription'],
  ['humanist','Humanist','settingsCatalog.fonts.humanistDescription'],
  ['serif','Serif','settingsCatalog.fonts.serifDescription']
] as const;

function Section({ icon: Icon, title, description, children }: { icon: SettingsIcon; title: string; description: string; children: React.ReactNode }) {
  return <section className="min-w-0 rounded-2xl border border-zinc-800 bg-black/20 p-3 sm:p-5"><div className="mb-4 flex gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950"><Icon className="h-4 w-4 text-cyan-400" /></span><div><h3 className="text-xs font-semibold">{title}</h3><p className="mt-1 text-[9px] text-zinc-600">{description}</p></div></div>{children}</section>;
}
function Row({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="grid min-h-16 min-w-0 items-center gap-3 border-b border-zinc-800/70 py-3 last:border-0 xl:grid-cols-[minmax(180px,.8fr)_minmax(0,1.4fr)]"><div><div className="text-[11px] font-medium">{title}</div><div className="mt-1 text-[9px] leading-4 text-zinc-600">{description}</div></div><div className="min-w-0">{children}</div></div>;
}
function Range({ value, min, max, step = 1, suffix = '', onChange }: { value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2"><input className="coreor-range min-w-0 flex-1" type="range" value={value} min={min} max={max} step={step} onChange={event => onChange(Number(event.target.value))} /><span className="w-16 text-right font-mono text-[10px] text-cyan-300">{value}{suffix}</span></div>;
}

export function DatabaseSettingsModal({ open, onClose, initialTab = 'account' }: DatabaseSettingsModalProps) {
  const {t,formatNumber}=useLanguage();
  const { workspaceKey, user } = useDesktop();
  const auth = useAuth();
  const platform = useNativePlatform();
  const { preferences, setPreferences, resetPreferences } = useAppPreferences();
  const { servers, activeServerId, setActiveServerId, removeServer, loadServers, isServersLoading } = useContext(DatabaseContext)!;
  const [tab, setTab] = useState<DatabaseSettingsTab>(initialTab);
  const [mounted, setMounted] = useState(false);
  const [profileConfirmation, setProfileConfirmation] = useState<CoreorConfirmation | null>(null);
  const [vaultStatus, setVaultStatus] = useState<LocalVaultStatus | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const themeOptions=useMemo<SearchSelectOption<AppThemeName>[]>(()=>THEME_DEFS.map(([value,label,description],index)=>({value:value as AppThemeName,label:label.includes('.')?t(label):label,description:t(description),badge:index===0?t('common.default'):undefined})),[t]);
  const syntaxOptions=useMemo<SearchSelectOption<SyntaxThemeName>[]>(()=>SYNTAX_DEFS.map(([value,label,description])=>({value:value as SyntaxThemeName,label,description:t(description)})),[t]);
  const fontOptions=useMemo<SearchSelectOption<AppFontFamily>[]>(()=>FONT_DEFS.map(([value,label,description])=>({value:value as AppFontFamily,label:label.includes('.')?t(label):label,description:t(description)})),[t]);
  const refreshOptions=useMemo<SearchSelectOption<PerformanceRefreshSeconds>[]>(()=>[1,3,5,10,15,30].map(value=>({value:value as PerformanceRefreshSeconds,label:t('settingsCatalog.monitoring.seconds',{value}),description:value<=3?t('settingsCatalog.monitoring.refreshFast'):value<=10?t('settingsCatalog.monitoring.refreshBalanced'):t('settingsCatalog.monitoring.refreshLow'),badge:value===5?t('common.default'):undefined})),[t]);
  useModalEscape(open, onClose);
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
  useEffect(() => {
    if (!open) return;
    setVaultError(null);
    void readLocalVaultStatus()
      .then(status => setVaultStatus(status))
      .catch(error => { setVaultStatus(null); setVaultError(error instanceof Error ? error.message : String(error)); });
  }, [open, servers.length]);
  const activeServer = servers.find(server => server.id === activeServerId) || null;
  const totalDatabases = servers.reduce((sum, server) => sum + (server.databases?.length || 0), 0);
  const totalTables = servers.reduce((sum, server) => sum + (server.databases || []).reduce((value, database) => value + database.tableCount, 0), 0);
  const device = useMemo(() => ({ platform: `${platformDisplayName(platform.os)} • ${platform.arch}`, language: typeof navigator === 'undefined' ? '—' : navigator.language, online: typeof navigator === 'undefined' ? true : navigator.onLine }), [open, platform.os, platform.arch]);
  if (!mounted || !open) return null;
  const activeTab = TABS.find(item => item.id === tab) || TABS[0];
  const ActiveIcon = activeTab.icon;

  return createPortal(
    <div className="fixed inset-0 z-[340] flex items-center justify-center p-2 sm:p-3">
      <button className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative z-10 grid h-[calc(100dvh-16px)] max-h-[880px] w-[calc(100vw-16px)] max-w-[1440px] grid-cols-[clamp(170px,20vw,235px)_minmax(0,1fr)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:h-[calc(100dvh-24px)] sm:w-[calc(100vw-24px)]">
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-zinc-800 bg-black/25">
          <div className="border-b border-zinc-800 p-4"><div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-cyan-400" /><div><div className="text-xs font-semibold">{t('common.settings')}</div><div className="text-[8px] text-zinc-600">Coreor Database v3.1.0</div></div></div></div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-2">{TABS.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={`mb-1 flex w-full gap-3 rounded-xl border px-3 py-2.5 text-left ${tab === item.id ? 'border-cyan-500/20 bg-cyan-500/10' : 'border-transparent hover:bg-white/[0.035]'}`}><Icon className={`mt-0.5 h-4 w-4 ${tab === item.id ? 'text-cyan-300' : 'text-zinc-600'}`} /><span><span className="block text-[10px] font-medium">{t(item.labelKey)}</span><span className="mt-0.5 block text-[8px] text-zinc-600">{t(item.descriptionKey)}</span></span></button>; })}</nav>
          <div className="border-t border-zinc-800 p-3"><Button variant="ghost" size="sm" className="w-full justify-start" onClick={resetPreferences}><RotateCcw className="mr-2 h-3.5 w-3.5" />{t('settingsCatalog.resetPreferences')}</Button></div>
        </aside>
        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <header className="flex h-16 items-center gap-3 border-b border-zinc-800 px-5"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800"><ActiveIcon className="h-4 w-4 text-cyan-400" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{t(activeTab.labelKey)}</h2><p className="text-[9px] text-zinc-600">{t(activeTab.descriptionKey)}</p></div><Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button></header>
          <div className="coreor-table-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5">
            {tab === 'account' && <div className="space-y-4"><section className="rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-cyan-500/[0.07] via-transparent to-purple-500/[0.05] p-5"><div className="flex items-center gap-4">{user?.image ? <img src={user.image} alt="" className="h-16 w-16 rounded-2xl border border-zinc-700 object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-700"><UserRound className="h-7 w-7" /></div>}<div><h3 className="text-lg font-semibold">{user?.name || t('settingsCatalog.account.userFallback')}</h3><div className="text-[10px] text-zinc-500">{user?.email || t('settingsCatalog.account.emailUnavailable')}</div></div></div><div className="mt-5 grid gap-2 sm:grid-cols-4">{[
              { icon: GitBranch, label: t('settingsCatalog.account.account'), value: user?.id || workspaceKey?.slice(0, 12) || '—' },
              { icon: Laptop, label: t('settingsCatalog.monitoring.device'), value: device.platform },
              { icon: Wifi, label: t('common.language'), value: device.language },
              { icon: ShieldCheck, label: t('settingsCatalog.account.network'), value: device.online ? t('common.connected') : t('common.offline') }
            ].map(item => { const Icon = item.icon; return <div key={item.label} className="rounded-xl border border-zinc-800 bg-black/20 p-3"><div className="flex items-center gap-2 text-[8px] text-zinc-600"><Icon className="h-3 w-3" />{item.label}</div><div className="mt-1 truncate text-[10px]">{item.value}</div></div>; })}</div></section><Section icon={UserRound} title={t('settingsCatalog.account.accountTitle')} description={t('settingsCatalog.account.accountDescription')}><Row title={t('settingsCatalog.account.sessionMode')} description={t('settingsCatalog.account.sessionDescription')}><div className={`rounded-xl border px-3 py-2 text-[10px] ${auth.isGuest ? 'border-zinc-800 bg-black/20 text-zinc-400' : 'border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-300'}`}>{auth.isGuest ? t('settingsCatalog.monitoring.guestMode') : t('settingsCatalog.account.signedIn',{user:auth.user?.email || auth.user?.name || '—'})}</div></Row><Row title={t('settingsCatalog.account.onlineFeatures')} description={t('settingsCatalog.account.onlineFeaturesDescription')}><div className="rounded-xl border border-zinc-800 bg-black/20 px-3 py-2 text-[9px] leading-5 text-zinc-500">{t('settingsCatalog.account.onlineFeatureNames')}<br/><span className="text-zinc-700">{t('settingsCatalog.account.cloudPrivacy')}</span></div></Row></Section><Section icon={KeyRound} title={t('settingsCatalog.account.localWorkspace')} description={t('settingsCatalog.account.localWorkspaceDescription')}><Row title={t('settingsCatalog.security.connectionVault')} description={t('settingsCatalog.account.localVaultDescription')}><div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] px-3 py-2 text-[10px] text-cyan-300">{t('settingsCatalog.account.vaultCounts',{profiles:formatNumber(servers.length),databases:formatNumber(totalDatabases),tables:formatNumber(totalTables)})}</div></Row><Row title={t('settingsCatalog.tabs.organizations')} description={t('settingsCatalog.account.organizationsDescription')}><Button variant="outline" className="w-full justify-between" onClick={() => setTab('organizations')}>{t('settingsCatalog.account.manageOrganizations')}<Building2 className="h-4 w-4" /></Button></Row></Section></div>}
            {tab === 'organizations' && <OrganizationSettingsPanel accountEmail={user?.email} />}
            {tab === 'servers' && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3">{[
              { icon: Server, label: t('settingsCatalog.servers.server'), value: servers.length }, { icon: Database, label: t('settingsCatalog.servers.database'), value: totalDatabases }, { icon: Code2, label: t('settingsCatalog.servers.table'), value: totalTables }
            ].map(item => { const Icon = item.icon; return <div key={item.label} className="rounded-2xl border border-zinc-800 p-4"><div className="flex items-center gap-2 text-[9px] text-zinc-600"><Icon className="h-4 w-4 text-cyan-400" />{item.label}</div><div className="mt-2 text-2xl font-semibold">{item.value}</div></div>; })}</div><Section icon={Server} title={t('settingsCatalog.servers.profiles')} description={t('settingsCatalog.servers.profilesDescription')}><div className="space-y-2">{servers.map(server => <div key={server.id} className={`flex items-center gap-3 rounded-xl border p-3 ${server.id === activeServerId ? 'border-cyan-500/25 bg-cyan-500/[0.04]' : 'border-zinc-800'}`}><Server className="h-4 w-4 shrink-0 text-emerald-400" /><button type="button" className="min-w-0 flex-1 text-left" onClick={() => setActiveServerId(server.id)}><div className="flex items-center gap-2"><span className="truncate text-[11px] font-medium">{server.name}</span>{server.id === activeServerId && <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[7px] text-cyan-300">{t('settingsCatalog.servers.active')}</span>}</div><div className="mt-0.5 font-mono text-[9px] text-zinc-600">{server.host}:{server.port} • {databaseEngineLabel(server.databaseType)} {server.version}</div><div className="mt-1 text-[8px] text-zinc-600">{t('settingsCatalog.servers.objectCounts',{databases:formatNumber(server.databases?.length || 0),tables:formatNumber((server.databases || []).reduce((sum,database)=>sum+database.tableCount,0))})}</div></button>{server.readOnly && <span className="rounded bg-amber-500/10 px-2 py-1 text-[8px] text-amber-300">READ ONLY</span>}<div className="flex shrink-0 items-center gap-1"><Button variant="ghost" size="icon" className="h-8 w-8" title={t('settingsCatalog.servers.editConnection')} onClick={() => window.dispatchEvent(new CustomEvent('coreor:edit-server-modal', { detail: { serverId: server.id } }))}><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8" title={t('settingsCatalog.servers.removeProfile')} onClick={() => setProfileConfirmation({ title: t('settingsCatalog.servers.removeProfileTitle'), description: t('settingsCatalog.servers.removeProfileDescription',{server:server.name}), confirmLabel: t('settingsCatalog.servers.removeProfile'), tone: 'danger', onConfirm: () => removeServer(server.id) })}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button></div></div>)}</div><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new Event('coreor:open-server-modal'))}><Plus className="mr-2 h-3.5 w-3.5" />{t('settingsCatalog.servers.newConnection')}</Button><Button variant="outline" size="sm" disabled={isServersLoading} onClick={() => void loadServers()}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${isServersLoading ? 'animate-spin' : ''}`} />{t('settingsCatalog.servers.refreshVault')}</Button></div></Section></div>}
            {tab === 'appearance' && <Section icon={Palette} title={t('settingsCatalog.appearance.title')} description={t('settingsCatalog.appearance.description')}><Row title={t('settingsCatalog.appearance.appTheme')} description={t('settingsCatalog.appearance.appThemeDescription')}><SearchSelect value={preferences.theme} options={themeOptions} onValueChange={theme => setPreferences({ theme })} dropdownMinWidth={600} /></Row><Row title={t('settingsCatalog.appearance.syntaxTheme')} description={t('settingsCatalog.appearance.syntaxThemeDescription')}><SearchSelect value={preferences.syntaxTheme} options={syntaxOptions} onValueChange={syntaxTheme => setPreferences({ syntaxTheme })} dropdownMinWidth={600} /></Row><Row title={t('settingsCatalog.appearance.fontFamily')} description={t('settingsCatalog.appearance.fontDescription')}><SearchSelect value={preferences.fontFamily} options={fontOptions} onValueChange={fontFamily => setPreferences({ fontFamily })} dropdownMinWidth={620} /></Row><Row title={t('settingsCatalog.appearance.uiSize')} description={t('settingsCatalog.appearance.uiSizeDescription')}><Range value={preferences.uiFontSize} min={10} max={18} suffix=" px" onChange={uiFontSize => setPreferences({ uiFontSize })} /></Row><Row title={t('settingsCatalog.appearance.sqlEditor')} description={t('settingsCatalog.appearance.sqlEditorDescription')}><Range value={preferences.editorFontSize} min={10} max={28} suffix=" px" onChange={editorFontSize => setPreferences({ editorFontSize })} /></Row><Row title={t('settingsCatalog.appearance.console')} description={t('settingsCatalog.appearance.consoleDescription')}><Range value={preferences.consoleFontSize} min={8} max={18} suffix=" px" onChange={consoleFontSize => setPreferences({ consoleFontSize })} /></Row><Row title={t('settingsCatalog.appearance.lineHeight')} description={t('settingsCatalog.appearance.lineHeightDescription')}><Range value={preferences.lineHeight} min={1.25} max={2} step={0.05} onChange={lineHeight => setPreferences({ lineHeight })} /></Row><Row title={t('settingsCatalog.explorer.groupedTitle')} description={t('settingsCatalog.explorer.groupedDescription')}><CoreorSwitch checked={preferences.objectExplorerGrouped} onCheckedChange={objectExplorerGrouped => setPreferences({ objectExplorerGrouped })} label={preferences.objectExplorerGrouped ? t('settingsCatalog.explorer.groupedEnabled') : t('settingsCatalog.explorer.groupedTitle')} /></Row><Row title={t('settingsCatalog.explorer.detailsTitle')} description={t('settingsCatalog.explorer.detailsDescription')}><CoreorSwitch checked={preferences.objectExplorerDetails} onCheckedChange={objectExplorerDetails => setPreferences({ objectExplorerDetails })} label={preferences.objectExplorerDetails ? t('settingsCatalog.explorer.showDetails') : t('settingsCatalog.explorer.hideDetails')} /></Row></Section>}
            {tab === 'accessibility' && <Section icon={Accessibility} title={t('settingsCatalog.tabs.accessibility')} description={t('settingsCatalog.accessibility.description')}><Row title={t('settingsCatalog.accessibility.reducedMotion')} description={t('settingsCatalog.accessibility.reducedMotionDescription')}><CoreorSwitch checked={preferences.reducedMotion} onCheckedChange={reducedMotion => setPreferences({ reducedMotion })} label={t('settingsCatalog.accessibility.reducedMotion')} /></Row><Row title={t('settingsCatalog.accessibility.strongFocus')} description={t('settingsCatalog.accessibility.focusDescription')}><CoreorSwitch checked={preferences.strongFocusRing} onCheckedChange={strongFocusRing => setPreferences({ strongFocusRing })} label={t('settingsCatalog.accessibility.focusRing')} /></Row><Row title={t('settingsCatalog.accessibility.contrastBorders')} description={t('settingsCatalog.accessibility.contrastBordersDescription')}><CoreorSwitch checked={preferences.highContrastBorders} onCheckedChange={highContrastBorders => setPreferences({ highContrastBorders })} label={t('settingsCatalog.accessibility.strongBorders')} /></Row></Section>}
            {tab === 'query' && <Section icon={Code2} title={t('settingsCatalog.query.safetyTitle')} description={t('settingsCatalog.query.safetyDescription')}><Row title={t('settingsCatalog.query.rememberSession')} description={t('settingsCatalog.query.restoreDescription')}><CoreorSwitch checked={preferences.rememberQueryWorkspace} onCheckedChange={rememberQueryWorkspace => setPreferences({ rememberQueryWorkspace })} label={t('settingsCatalog.query.restoreTabs')} /></Row><Row title={t('settingsCatalog.query.autocomplete')} description={t('settingsCatalog.query.suggestionsDescription')}><CoreorSwitch checked={preferences.autocomplete} onCheckedChange={autocomplete => setPreferences({ autocomplete })} label={t('settingsCatalog.query.enableSuggestions')} /></Row><Row title={t('settingsCatalog.query.localLanguageServer')} description={t('settingsCatalog.query.languageServerDescription')}><div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2 text-[10px] text-emerald-300">{t('settingsCatalog.query.languageServerActive')}</div></Row><Row title={t('settingsCatalog.query.dryRun')} description={t('settingsCatalog.query.dryRunDescription')}><CoreorSwitch checked={preferences.dryRunMutations} onCheckedChange={dryRunMutations => setPreferences({ dryRunMutations })} label={t('settingsCatalog.query.dryRunPreview')} /></Row><Row title={t('settingsCatalog.query.dangerousConfirmation')} description={t('settingsCatalog.query.dangerousConfirmationDescription')}><CoreorSwitch checked={preferences.confirmDangerousQueries} onCheckedChange={confirmDangerousQueries => setPreferences({ confirmDangerousQueries })} label={t('settingsCatalog.query.requestApproval')} /></Row><Row title={t('settingsCatalog.query.resultLimit')} description={t('settingsCatalog.query.resultLimitDescription')}><SearchSelect value={String(preferences.queryResultLimit)} options={[100, 500, 1000, 2500, 5000, 10000, 25000, 50000].map(value => ({ value: String(value), label:t('tableData.rowsCount',{count:formatNumber(value)}) }))} onValueChange={value => setPreferences({ queryResultLimit: Number(value) })} /></Row><Row title={t('settingsCatalog.query.keyboardShortcuts')} description={t('settingsCatalog.query.platformDetected',{platform:detectPlatform()==='mac'?'macOS':detectPlatform()==='windows'?'Windows':'Linux'})}><div className="grid gap-1.5 sm:grid-cols-2">{([
  ['commandPalette',t('settingsCatalog.shortcuts.commandPalette')],['newQuery',t('settingsCatalog.shortcuts.newQuery')],['runQuery',t('settingsCatalog.shortcuts.runQuery')],['formatSql',t('settingsCatalog.shortcuts.formatSql')],['refresh',t('common.refresh')],['insertRow',t('tableData.addRow')],['settings',t('common.settings')],['find',t('settingsCatalog.shortcuts.find')],['closeTab',t('settingsCatalog.shortcuts.closeTab')],['duplicateTab',t('settingsCatalog.shortcuts.duplicateTab')],['language',t('settingsCatalog.shortcuts.language')],['backupCenter',t('settingsCatalog.shortcuts.backupCenter')],['automationCenter',t('settingsCatalog.shortcuts.automationCenter')]
] as Array<[ShortcutId,string]>).map(([id,label])=><div key={id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-black/20 px-2.5 py-1.5"><span className="text-[9px] text-zinc-500">{label}</span><kbd className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[9px] text-cyan-300">{shortcutLabel(id)}</kbd></div>)}</div></Row></Section>}
            {tab === 'security' && <div className="space-y-4"><Section icon={KeyRound} title={t('settingsCatalog.security.connectionVault')} description={t('settingsCatalog.security.plaintextDescription')}><Row title={t('settingsCatalog.security.connectionVault')} description={t('settingsCatalog.security.connectionVaultDescription')}><div className={`rounded-xl border px-3 py-2 text-[10px] ${vaultError ? 'border-red-500/20 bg-red-500/[0.05] text-red-300' : 'border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-300'}`}>{vaultError || (vaultStatus ? `${vaultStatus.algorithm} • ${vaultStatus.connectionCount} profil` : t('settingsCatalog.security.vaultLoading'))}</div></Row><Row title={t('settingsCatalog.security.workspaceVault')} description={t('settingsCatalog.security.workspaceVaultDescription')}><div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] px-3 py-2 text-[10px] text-cyan-200">{vaultStatus ? t('settingsCatalog.security.workspaceStatus',{algorithm:vaultStatus.workspaceEncrypted?'AES-256-GCM':'—',count:formatNumber(vaultStatus.workspaceCollectionCount)}) : t('settingsCatalog.security.workspaceLoading')}</div></Row><Row title={t('settingsCatalog.security.deviceKey')} description={t('settingsCatalog.security.deviceKeyDescription')}><div className="rounded-xl border border-zinc-800 bg-black/20 px-3 py-2 text-[10px] text-zinc-300">{vaultStatus ? `${vaultStatus.keyBackend} • ${vaultStatus.keyAvailable ? t('settingsCatalog.security.keyReady') : vaultStatus.connectionCount ? t('settingsCatalog.security.keyMissing') : t('settingsCatalog.security.keyOnFirstConnection')}` : '—'}</div></Row><Row title={t('settingsCatalog.security.zeroKnowledge')} description={t('settingsCatalog.security.zeroKnowledgeDescription')}><div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] px-3 py-2 text-[9px] leading-5 text-cyan-200">{t('settingsCatalog.security.zeroKnowledgeReady')}<br/><span className="text-zinc-600">{t('settingsCatalog.security.cloudNotActive')}</span></div></Row></Section><Section icon={ShieldCheck} title={t('settingsCatalog.security.schemaProtection')} description={t('settingsCatalog.security.schemaProtectionDescription')}><Row title={t('settingsCatalog.security.autoSnapshot')} description={t('settingsCatalog.security.autoSnapshotDescription')}><CoreorSwitch checked={preferences.autoSchemaSnapshots} onCheckedChange={autoSchemaSnapshots => setPreferences({ autoSchemaSnapshots })} label={t('settingsCatalog.security.takeSnapshot')} /></Row><Row title={t('settingsCatalog.security.secondApproval')} description={t('settingsCatalog.security.secondApprovalDescription')}><CoreorSwitch checked={preferences.requireSecondApproval} onCheckedChange={requireSecondApproval => setPreferences({ requireSecondApproval })} label={t('settingsCatalog.security.secondApprovalRequired')} /></Row><Row title={t('settingsCatalog.security.productionAlter')} description={t('settingsCatalog.security.productionAlterDescription')}><CoreorSwitch checked={preferences.productionAlterApproval} onCheckedChange={productionAlterApproval => setPreferences({ productionAlterApproval })} label={t('settingsCatalog.security.alterApproval')} /></Row><Row title={t('settingsCatalog.security.defaultReadOnly')} description={t('settingsCatalog.security.defaultReadOnlyDescription')}><CoreorSwitch checked={preferences.defaultReadOnlyConnections} onCheckedChange={defaultReadOnlyConnections => setPreferences({ defaultReadOnlyConnections })} label={t('settingsCatalog.security.defaultReadOnly')} /></Row><Row title={t('settingsCatalog.security.openApprovalCenter')} description={t('settingsCatalog.security.approvalCenterDescription')}><Button variant="outline" className="w-full" onClick={() => window.dispatchEvent(new CustomEvent('coreor:open-automation-center', { detail: { tab: 'approvals' } }))}>{t('settingsCatalog.security.manageApprovals')}</Button></Row></Section>{activeServer?.readOnly && <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-4 text-[10px] leading-5 text-amber-100"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0"/><div><b>{activeServer.name}</b> {t('settingsCatalog.security.readOnlyNative')}</div></div>}</div>}
            {tab === 'advanced' && <div className="space-y-4"><Section icon={BellRing} title={t('settingsCatalog.monitoring.liveTrackingTitle')} description={t('settingsCatalog.monitoring.localRules')}><Row title={t('settingsCatalog.monitoring.instantNotifications')} description={t('settingsCatalog.monitoring.instantNotificationsDescription')}><CoreorSwitch checked={preferences.liveNotifications} onCheckedChange={liveNotifications => setPreferences({ liveNotifications })} label={t('settingsCatalog.monitoring.liveMonitor')} /></Row><Row title={t('settingsCatalog.monitoring.performanceRefresh')} description={t('settingsCatalog.monitoring.refreshIntervalDescription')}><SearchSelect value={preferences.performanceRefreshSeconds} options={refreshOptions} onValueChange={performanceRefreshSeconds => setPreferences({ performanceRefreshSeconds })} dropdownMinWidth={480} /></Row><Row title={t('intelligence.alertRules')} description={t('settingsCatalog.monitoring.alertRulesDescription')}><Button variant="outline" className="w-full" onClick={() => window.dispatchEvent(new CustomEvent('coreor:open-intelligence-center', { detail: { tab: 'alerts' } }))}>{t('settingsCatalog.monitoring.openAlertCenter')}</Button></Row></Section><Section icon={BrainCircuit} title={t('settingsCatalog.monitoring.intelligenceTitle')} description={t('settingsCatalog.monitoring.intelligenceDescription')}><Row title={t('settingsCatalog.monitoring.intelligenceCenter')} description={t('settingsCatalog.monitoring.intelligenceLocal')}><Button variant="outline" className="w-full" onClick={() => window.dispatchEvent(new CustomEvent('coreor:open-intelligence-center', { detail: { tab: 'profiler' } }))}>{t('settingsCatalog.monitoring.openIntelligence')}</Button></Row><Row title={t('settingsCatalog.monitoring.compactTitle')} description={t('settingsCatalog.monitoring.compactDescription')}><CoreorSwitch checked={preferences.compactMode} onCheckedChange={compactMode => setPreferences({ compactMode })} label={t('settingsCatalog.monitoring.compactTitle')} /></Row><Row title={t('settingsCatalog.monitoring.rememberPanels')} description={t('settingsCatalog.monitoring.rememberPanelsDescription')}><CoreorSwitch checked={preferences.rememberPanelSizes} onCheckedChange={rememberPanelSizes => setPreferences({ rememberPanelSizes })} label={t('settingsCatalog.monitoring.saveLayout')} /></Row><Row title={t('settingsCatalog.monitoring.processAutoRefresh')} description={t('settingsCatalog.monitoring.processBackground')}><CoreorSwitch checked={preferences.autoRefreshProcesses} onCheckedChange={autoRefreshProcesses => setPreferences({ autoRefreshProcesses })} label={t('settingsCatalog.monitoring.autoRefresh')} /></Row><Row title={t('settingsCatalog.developer.tools')} description={t('settingsCatalog.developer.toolsDescription')}><CoreorSwitch checked={preferences.developerToolsEnabled} onCheckedChange={enabled => {
  if (!enabled) {
    setPreferences({ developerToolsEnabled: false });
    return;
  }
  setProfileConfirmation({
    title: t('settingsCatalog.developer.enable'),
    description: t('settingsCatalog.developer.warning'),
    confirmLabel: t('settingsCatalog.developer.accept'),
    tone: 'danger',
    onConfirm: () => { setPreferences({ developerToolsEnabled: true }); }
  });
}} label={preferences.developerToolsEnabled ? t('settingsCatalog.developer.enabled') : t('settingsCatalog.developer.disabled')} /></Row><Row title={t('settingsCatalog.developer.operations')} description={t('settingsCatalog.developer.operationsDescription')}><Button variant="outline" className="w-full" onClick={() => window.dispatchEvent(new CustomEvent('coreor:open-automation-center', { detail: { tab: 'history' } }))}>{t('settingsCatalog.developer.openOperations')}</Button></Row></Section></div>}
            {tab === 'whats-new' && <ReleaseNotesTree compact />}
          </div>
        </main>
      </div>
      <CoreorConfirmModal action={profileConfirmation} onClose={() => setProfileConfirmation(null)} />
    </div>,
    document.body
  );
}
