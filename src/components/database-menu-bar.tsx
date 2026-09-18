'use client';

import React, { useContext, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Activity,
  Archive,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Command,
  Database,
  FileInput,
  Gauge,
  Loader2,
  Network,
  Minus,
  Square,
  X,
  RefreshCw,
  Server,
  Settings2,
  ShieldAlert,
  Sparkles,
  UserCog,
  Wrench,
  XCircle
} from 'lucide-react';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useDesktop } from '@/context/DesktopContext';
import { useLanguage } from '@/context/LanguageContext';
import { fetchServerTables, testStoredDatabaseConnection } from '@/lib/databaseApi';
import {
  OPEN_IMPORT_EXPORT_EVENT,
  OPEN_MAINTENANCE_CENTER_EVENT,
  OPEN_PERFORMANCE_PANEL_EVENT,
  OPEN_PROCESS_CENTER_EVENT,
  OPEN_SETTINGS_MODAL_EVENT,
  OPEN_SQL_NOTEBOOK_EVENT,
  OPEN_TRANSACTION_WORKSPACE_EVENT,
  OPEN_USER_MANAGER_EVENT,
  TOGGLE_COMMAND_PALETTE_EVENT,
  dispatchDatabaseTool,
  type OpenMaintenanceCenterDetail,
  type OpenSettingsModalDetail
} from '@/lib/databaseToolEvents';
import { databaseEngineFamily, databaseEngineLabel } from '@/lib/databaseEngines';
import type { DatabaseSettingsTab } from '@/components/database-settings-modal';
import type { AutomationCenterTab } from '@/components/database-automation-center-modal';
import type { IntelligenceCenterTab } from '@/components/database-intelligence-center-modal';

const DatabaseUserManagerModal = dynamic(() => import('@/components/database-user-manager-modal').then(module => module.DatabaseUserManagerModal), { ssr: false });
const DatabaseProcessCenterModal = dynamic(() => import('@/components/database-process-center-modal').then(module => module.DatabaseProcessCenterModal), { ssr: false });
const DatabaseImportExportModal = dynamic(() => import('@/components/database-import-export-modal').then(module => module.DatabaseImportExportModal), { ssr: false });
const DatabasePerformancePanelModal = dynamic(() => import('@/components/database-performance-panel-modal').then(module => module.DatabasePerformancePanelModal), { ssr: false });
const SqlNotebookModal = dynamic(() => import('@/components/sql-notebook-modal').then(module => module.SqlNotebookModal), { ssr: false });
const DatabaseSettingsModal = dynamic(() => import('@/components/database-settings-modal').then(module => module.DatabaseSettingsModal), { ssr: false });
const DatabaseTransactionWorkspaceModal = dynamic(() => import('@/components/database-transaction-workspace-modal').then(module => module.DatabaseTransactionWorkspaceModal), { ssr: false });
const DatabaseAutomationCenterModal = dynamic(() => import('@/components/database-automation-center-modal').then(module => module.DatabaseAutomationCenterModal), { ssr: false });
const DatabaseIntelligenceCenterModal = dynamic(() => import('@/components/database-intelligence-center-modal').then(module => module.DatabaseIntelligenceCenterModal), { ssr: false });
const DatabaseMaintenanceModal = dynamic(() => import('@/components/database-maintenance-modal').then(module => module.DatabaseMaintenanceModal), { ssr: false });
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
import { shortcutLabel } from '@/lib/shortcuts';
import { useNativePlatform } from '@/lib/platformRuntime';
import { DatabaseNotificationBell } from '@/components/database-notification-bell';

interface DatabaseMenuBarProps { selectedDatabase: string | null; selectedTable: string | null; }

export function DatabaseMenuBar({ selectedDatabase, selectedTable }: DatabaseMenuBarProps) {
  const { workspaceKey } = useDesktop();
  const { t } = useLanguage();
  const platform = useNativePlatform();
  const { servers, databases, activeServerId, setActiveServerId, loadServers } = useContext(DatabaseContext)!;
  const activeServer = servers.find(server => server.id === activeServerId) ?? null;
  const mysqlWorkbench = databaseEngineFamily(activeServer?.databaseType) === 'mysql';
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [usersOpen, setUsersOpen] = useState(false);
  const [processOpen, setProcessOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [performanceOpen, setPerformanceOpen] = useState(false);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<DatabaseSettingsTab>('account');
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [automationTab, setAutomationTab] = useState<AutomationCenterTab>('history');
  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
  const [intelligenceTab, setIntelligenceTab] = useState<IntelligenceCenterTab>('profiler');
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenanceContext, setMaintenanceContext] = useState<OpenMaintenanceCenterDetail>({});

  const serverOptions = useMemo<SearchSelectOption[]>(() => servers.map(server => ({
    value: server.id, label: server.name, description: `${server.host}:${server.port || 3306}`,
    badge: databaseEngineLabel(server.databaseType), keywords: [server.host || '', server.username || '', server.databaseType || 'mysql']
  })), [servers]);

  useEffect(() => {
    const openUsers = () => setUsersOpen(true); const openProcesses = () => setProcessOpen(true);
    const openTransfer = () => setTransferOpen(true); const openPerformance = () => setPerformanceOpen(true);
    const openNotebook = () => setNotebookOpen(true); const openTransaction = () => setTransactionOpen(true);
    const openSettings = (event: Event) => { const detail = (event as CustomEvent<OpenSettingsModalDetail>).detail; setSettingsTab(detail?.tab || 'account'); setSettingsOpen(true); };
    const openAutomation = (event: Event) => { const detail = (event as CustomEvent<{ tab?: AutomationCenterTab }>).detail; setAutomationTab(detail?.tab || 'history'); setAutomationOpen(true); };
    const openIntelligence = (event: Event) => { const detail = (event as CustomEvent<{ tab?: IntelligenceCenterTab }>).detail; setIntelligenceTab(detail?.tab || 'profiler'); setIntelligenceOpen(true); };
    const openMaintenance = (event: Event) => {
      const detail = (event as CustomEvent<OpenMaintenanceCenterDetail>).detail || {};
      if (detail.serverId) setActiveServerId(detail.serverId);
      setMaintenanceContext(detail);
      setMaintenanceOpen(true);
    };
    window.addEventListener(OPEN_USER_MANAGER_EVENT, openUsers); window.addEventListener(OPEN_PROCESS_CENTER_EVENT, openProcesses);
    window.addEventListener(OPEN_IMPORT_EXPORT_EVENT, openTransfer); window.addEventListener(OPEN_PERFORMANCE_PANEL_EVENT, openPerformance);
    window.addEventListener(OPEN_SQL_NOTEBOOK_EVENT, openNotebook); window.addEventListener(OPEN_TRANSACTION_WORKSPACE_EVENT, openTransaction);
    window.addEventListener(OPEN_SETTINGS_MODAL_EVENT, openSettings); window.addEventListener('coreor:open-automation-center', openAutomation);
    window.addEventListener('coreor:open-intelligence-center', openIntelligence); window.addEventListener(OPEN_MAINTENANCE_CENTER_EVENT, openMaintenance);
    return () => {
      window.removeEventListener(OPEN_USER_MANAGER_EVENT, openUsers); window.removeEventListener(OPEN_PROCESS_CENTER_EVENT, openProcesses);
      window.removeEventListener(OPEN_IMPORT_EXPORT_EVENT, openTransfer); window.removeEventListener(OPEN_PERFORMANCE_PANEL_EVENT, openPerformance);
      window.removeEventListener(OPEN_SQL_NOTEBOOK_EVENT, openNotebook); window.removeEventListener(OPEN_TRANSACTION_WORKSPACE_EVENT, openTransaction);
      window.removeEventListener(OPEN_SETTINGS_MODAL_EVENT, openSettings); window.removeEventListener('coreor:open-automation-center', openAutomation);
      window.removeEventListener('coreor:open-intelligence-center', openIntelligence); window.removeEventListener(OPEN_MAINTENANCE_CENTER_EVENT, openMaintenance);
    };
  }, []);

  const connect = async () => {
    if (!activeServer || !workspaceKey || busy) return;
    setBusy(true); setStatus(null);
    try {
      const result = await testStoredDatabaseConnection(activeServer.id, workspaceKey);
      await fetchServerTables(activeServer.id, workspaceKey);
      await loadServers();
      setStatus({ tone: 'success', text: t('status.connectionReadyVersion', { version: result.connection?.version || databaseEngineLabel(activeServer.databaseType) }) });
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : t('status.connectionFailed') });
    } finally { setBusy(false); }
  };
  const refreshCatalog = async () => {
    if (!activeServer || !workspaceKey || busy) return;
    setBusy(true); setStatus(null);
    try {
      await fetchServerTables(activeServer.id, workspaceKey);
      await loadServers();
      setStatus({ tone: 'success', text: t('status.catalogRefreshed') });
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : t('status.catalogRefreshFailed') });
    } finally { setBusy(false); }
  };
  const openSettings = (tab: DatabaseSettingsTab = 'account') => { setSettingsTab(tab); setSettingsOpen(true); };
  const openAutomation = (tab: AutomationCenterTab) => { setAutomationTab(tab); setAutomationOpen(true); };
  const openIntelligence = (tab: IntelligenceCenterTab) => { setIntelligenceTab(tab); setIntelligenceOpen(true); };
  const toolButton = 'flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-[10px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-35';
  const windowButton = 'flex h-8 w-10 shrink-0 items-center justify-center text-zinc-500 transition-colors hover:bg-white/[0.07] hover:text-zinc-100';

  const windowAction = async (action: 'minimize' | 'maximize' | 'close') => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    if (action === 'minimize') await appWindow.minimize();
    if (action === 'maximize') await appWindow.toggleMaximize();
    if (action === 'close') await appWindow.close();
  };

  return <>
    <div data-coreor-app-chrome="top" className="relative z-[2147483000] flex h-8 shrink-0 select-none items-stretch border-b border-zinc-800 bg-zinc-950/95 text-[11px] text-zinc-400 shadow-sm backdrop-blur">
      {platform.os === 'macos' && <div className="flex shrink-0 items-center gap-2 px-3" data-tauri-drag-region>
        <button type="button" className="h-3 w-3 rounded-full bg-red-500/90 ring-1 ring-red-400/30 transition hover:bg-red-400" onClick={() => void windowAction('close')} title="Kapat" aria-label={t('common.close')} />
        <button type="button" className="h-3 w-3 rounded-full bg-amber-400/90 ring-1 ring-amber-300/30 transition hover:bg-amber-300" onClick={() => void windowAction('minimize')} title={t('window.minimize')} aria-label="Küçült" />
        <button type="button" className="h-3 w-3 rounded-full bg-emerald-500/90 ring-1 ring-emerald-400/30 transition hover:bg-emerald-400" onClick={() => void windowAction('maximize')} title={t('window.maximizeRestore')} aria-label="Büyüt veya geri yükle" />
      </div>}
      <div className="coreor-hide-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto pl-2">
      <div className="mr-1 flex min-w-44 max-w-64 shrink-0 items-center gap-2"><Database className="h-3.5 w-3.5 shrink-0 text-emerald-400" /><SearchSelect value={activeServerId || ''} options={serverOptions} onValueChange={serverId => setActiveServerId(serverId || null)} placeholder={t('topbar.connectionSelect')} searchPlaceholder={t('topbar.connectionSearch')} emptyText={t('topbar.noSavedServer')} className="min-w-0 flex-1" triggerClassName="min-h-7 h-7 rounded-lg border-zinc-800/80 bg-black/20 px-2 [&>span]:py-0" dropdownMinWidth={390} showDescriptionInTrigger={false} /></div>
      <button className={toolButton} disabled={!activeServer || busy} onClick={() => void connect()}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" /> : <Server className="h-3.5 w-3.5 text-emerald-400" />}{t('topbar.connect')}</button>
      <button className={toolButton} disabled={!activeServer || busy} onClick={() => void refreshCatalog()}><RefreshCw className="h-3.5 w-3.5" />{t('topbar.refresh')}</button>
      <span className="mx-1 h-4 w-px shrink-0 bg-zinc-800" />
      <button className={toolButton} onClick={() => dispatchDatabaseTool(TOGGLE_COMMAND_PALETTE_EVENT)}><Command className="h-3.5 w-3.5 text-cyan-400" />{t('topbar.command')}<span suppressHydrationWarning className="rounded border border-zinc-800 px-1 py-0.5 font-mono text-[8px] text-zinc-600">{shortcutLabel('commandPalette')}</span></button>
      <button className={toolButton} disabled={!activeServer} onClick={() => openIntelligence('profiler')} title={t('tooltip.dataIntelligence')}><BrainCircuit className="h-3.5 w-3.5 text-fuchsia-400" />{t('topbar.dataIntelligence')}</button>
      <button className={toolButton} disabled={!activeServer} onClick={() => openAutomation('backups')} title={t('tooltip.backup')}><Archive className="h-3.5 w-3.5 text-emerald-400" />{t('topbar.backup')}</button>
      <button className={toolButton} disabled={!activeServer} onClick={() => openAutomation('history')} title={t('tooltip.operations')}><Sparkles className="h-3.5 w-3.5 text-cyan-400" />{t('topbar.operations')}</button>
      <button className={toolButton} disabled={!activeServer} onClick={() => { setMaintenanceContext({ serverId: activeServerId, databaseName: selectedDatabase, tableName: selectedTable }); setMaintenanceOpen(true); }} title={t('maintenance.topbarTooltip')}><Wrench className="h-3.5 w-3.5 text-sky-400" />{t('maintenance.title')}</button>
      <button className={toolButton} disabled={!activeServer || !mysqlWorkbench} onClick={() => setTransactionOpen(true)}><ShieldAlert className="h-3.5 w-3.5 text-amber-400" />{t('topbar.transaction')}</button>
      <button className={toolButton} disabled={!activeServer || !mysqlWorkbench} onClick={() => setUsersOpen(true)}><UserCog className="h-3.5 w-3.5 text-purple-400" />{t('topbar.users')}</button>
      <button className={toolButton} disabled={!activeServer || !mysqlWorkbench} onClick={() => setProcessOpen(true)}><Activity className="h-3.5 w-3.5 text-amber-400" />{t('topbar.processes')}</button>
      <button className={toolButton} disabled={!activeServer || !mysqlWorkbench} onClick={() => setPerformanceOpen(true)}><Gauge className="h-3.5 w-3.5 text-emerald-400" />{t('topbar.performance')}</button>
      <button className={toolButton} disabled={!activeServer} onClick={() => setNotebookOpen(true)}><BookOpen className="h-3.5 w-3.5 text-purple-400" />{t('topbar.notebook')}</button>
      <button className={toolButton} disabled={!activeServer} onClick={() => setTransferOpen(true)}><FileInput className="h-3.5 w-3.5 text-emerald-400" />{t('topbar.transfer')}</button>
      <button className={toolButton} disabled={!activeServer || !selectedDatabase} onClick={() => window.dispatchEvent(new Event('coreor:open-schema-graph'))}><Network className="h-3.5 w-3.5 text-cyan-400" />{t('topbar.schema')}</button>
      <button className={toolButton} onClick={() => openSettings('account')}><Settings2 className="h-3.5 w-3.5" />{t('topbar.settings')}</button>
      {status && <button className={`ml-2 inline-flex min-w-0 shrink-0 items-center gap-1.5 truncate text-[10px] ${status.tone === 'success' ? 'text-emerald-400' : 'text-red-400'}`} onClick={() => setStatus(null)}>{status.tone === 'success' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}<span className="max-w-64 truncate">{status.text}</span></button>}
      {activeServer?.readOnly && <span className="ml-1 shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[8px] text-amber-300">{t('topbar.readOnly')}</span>}
      <div className="min-w-8 flex-1 self-stretch" data-tauri-drag-region title={t('window.drag')} onDoubleClick={() => void windowAction('maximize')} />
      </div>
      <DatabaseNotificationBell />
      {platform.os !== 'macos' && <div className="flex shrink-0 items-center border-l border-zinc-800 bg-black/15">
        <button type="button" className={windowButton} onClick={() => void windowAction('minimize')} title={t('window.minimize')} aria-label="Küçült"><Minus className="h-3.5 w-3.5" strokeWidth={1.7} /></button>
        <button type="button" className={windowButton} onClick={() => void windowAction('maximize')} title={t('window.maximizeRestore')} aria-label="Büyüt veya geri yükle"><Square className="h-3 w-3" strokeWidth={1.7} /></button>
        <button type="button" className={`${windowButton} hover:!bg-red-600 hover:!text-white`} onClick={() => void windowAction('close')} title="Kapat" aria-label={t('common.close')}><X className="h-4 w-4" strokeWidth={1.7} /></button>
      </div>}
    </div>
    {usersOpen && <DatabaseUserManagerModal open={usersOpen} onClose={() => setUsersOpen(false)} serverId={activeServerId} accountId={workspaceKey} databases={databases} />}
    {processOpen && <DatabaseProcessCenterModal open={processOpen} onClose={() => setProcessOpen(false)} serverId={activeServerId} accountId={workspaceKey} />}
    {performanceOpen && <DatabasePerformancePanelModal open={performanceOpen} onClose={() => setPerformanceOpen(false)} serverId={activeServerId} accountId={workspaceKey} selectedDatabase={selectedDatabase} />}
    {notebookOpen && <SqlNotebookModal open={notebookOpen} onClose={() => setNotebookOpen(false)} serverId={activeServerId} accountId={workspaceKey} databases={databases} selectedDatabase={selectedDatabase} />}
    {transferOpen && <DatabaseImportExportModal open={transferOpen} onClose={() => setTransferOpen(false)} serverId={activeServerId} accountId={workspaceKey} databases={databases} selectedDatabase={selectedDatabase} selectedTable={selectedTable} />}
    {settingsOpen && <DatabaseSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} initialTab={settingsTab} />}
    {transactionOpen && <DatabaseTransactionWorkspaceModal open={transactionOpen} onClose={() => setTransactionOpen(false)} serverId={activeServerId} accountId={workspaceKey} databases={databases} selectedDatabase={selectedDatabase} />}
    {automationOpen && <DatabaseAutomationCenterModal open={automationOpen} onClose={() => setAutomationOpen(false)} initialTab={automationTab} servers={servers} activeServerId={activeServerId} accountId={workspaceKey} selectedDatabase={selectedDatabase} selectedTable={selectedTable} />}
    {intelligenceOpen && <DatabaseIntelligenceCenterModal open={intelligenceOpen} onClose={() => setIntelligenceOpen(false)} initialTab={intelligenceTab} servers={servers} activeServerId={activeServerId} accountId={workspaceKey} selectedDatabase={selectedDatabase} selectedTable={selectedTable} />}
    {maintenanceOpen && <DatabaseMaintenanceModal
      open={maintenanceOpen}
      onClose={() => setMaintenanceOpen(false)}
      server={servers.find(server => server.id === (maintenanceContext.serverId || activeServerId)) || activeServer}
      accountId={workspaceKey}
      initialDatabase={maintenanceContext.databaseName ?? selectedDatabase}
      initialTable={maintenanceContext.tableName ?? selectedTable}
    />}
  </>;
}
