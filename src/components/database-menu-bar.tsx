'use client';

import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  CheckCircle2,
  Command,
  Database,
  FileInput,
  Gauge,
  HardDriveDownload,
  Loader2,
  Network,
  RefreshCw,
  Server,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  XCircle
} from 'lucide-react';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useAuth } from '@/context/AuthContext';
import { fetchServerTables, testStoredDatabaseConnection } from '@/lib/databaseApi';
import {
  OPEN_IMPORT_EXPORT_EVENT,
  OPEN_PERFORMANCE_PANEL_EVENT,
  OPEN_PROCESS_CENTER_EVENT,
  OPEN_SETTINGS_MODAL_EVENT,
  OPEN_SQL_NOTEBOOK_EVENT,
  OPEN_TRANSACTION_WORKSPACE_EVENT,
  OPEN_USER_MANAGER_EVENT,
  TOGGLE_COMMAND_PALETTE_EVENT,
  dispatchDatabaseTool,
  type OpenSettingsModalDetail
} from '@/lib/databaseToolEvents';
import {
  OPEN_DATABASE_SAFETY_CENTER_EVENT,
  type DatabaseSafetyCenterTab,
  type OpenDatabaseSafetyCenterDetail
} from '@/lib/databaseSafetyEvents';
import { databaseEngineFamily, databaseEngineLabel } from '@/lib/databaseEngines';
import { DatabaseUserManagerModal } from '@/components/database-user-manager-modal';
import { DatabaseProcessCenterModal } from '@/components/database-process-center-modal';
import { DatabaseImportExportModal } from '@/components/database-import-export-modal';
import { DatabasePerformancePanelModal } from '@/components/database-performance-panel-modal';
import { SqlNotebookModal } from '@/components/sql-notebook-modal';
import { DatabaseSettingsModal, type DatabaseSettingsTab } from '@/components/database-settings-modal';
import { DatabaseTransactionWorkspaceModal } from '@/components/database-transaction-workspace-modal';
import { DatabaseSafetyCenterModal } from '@/components/database-safety-center-modal';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';

interface DatabaseMenuBarProps {
  selectedDatabase: string | null;
  selectedTable: string | null;
}

export function DatabaseMenuBar({ selectedDatabase, selectedTable }: DatabaseMenuBarProps) {
  const { activeToken } = useAuth();
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
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyTab, setSafetyTab] = useState<DatabaseSafetyCenterTab>('history');
  const [safetySql, setSafetySql] = useState('');

  const serverOptions = useMemo<SearchSelectOption[]>(() => servers.map(server => ({
    value: server.id,
    label: server.name,
    description: `${server.host}:${server.port || 3306}`,
    badge: databaseEngineLabel(server.databaseType),
    keywords: [server.host || '', server.username || '', server.databaseType || 'mysql']
  })), [servers]);

  useEffect(() => {
    const openUsers = () => setUsersOpen(true);
    const openProcesses = () => setProcessOpen(true);
    const openTransfer = () => setTransferOpen(true);
    const openPerformance = () => setPerformanceOpen(true);
    const openNotebook = () => setNotebookOpen(true);
    const openTransaction = () => setTransactionOpen(true);
    const openSettings = (event: Event) => {
      const detail = (event as CustomEvent<OpenSettingsModalDetail>).detail;
      setSettingsTab(detail?.tab || 'account');
      setSettingsOpen(true);
    };
    const openSafety = (event: Event) => {
      const detail = (event as CustomEvent<OpenDatabaseSafetyCenterDetail>).detail || {};
      setSafetyTab(detail.tab || 'history');
      setSafetySql(detail.sql || '');
      if (detail.serverId) setActiveServerId(detail.serverId);
      setSafetyOpen(true);
    };
    window.addEventListener(OPEN_USER_MANAGER_EVENT, openUsers);
    window.addEventListener(OPEN_PROCESS_CENTER_EVENT, openProcesses);
    window.addEventListener(OPEN_IMPORT_EXPORT_EVENT, openTransfer);
    window.addEventListener(OPEN_PERFORMANCE_PANEL_EVENT, openPerformance);
    window.addEventListener(OPEN_SQL_NOTEBOOK_EVENT, openNotebook);
    window.addEventListener(OPEN_TRANSACTION_WORKSPACE_EVENT, openTransaction);
    window.addEventListener(OPEN_SETTINGS_MODAL_EVENT, openSettings);
    window.addEventListener(OPEN_DATABASE_SAFETY_CENTER_EVENT, openSafety);
    return () => {
      window.removeEventListener(OPEN_USER_MANAGER_EVENT, openUsers);
      window.removeEventListener(OPEN_PROCESS_CENTER_EVENT, openProcesses);
      window.removeEventListener(OPEN_IMPORT_EXPORT_EVENT, openTransfer);
      window.removeEventListener(OPEN_PERFORMANCE_PANEL_EVENT, openPerformance);
      window.removeEventListener(OPEN_SQL_NOTEBOOK_EVENT, openNotebook);
      window.removeEventListener(OPEN_TRANSACTION_WORKSPACE_EVENT, openTransaction);
      window.removeEventListener(OPEN_SETTINGS_MODAL_EVENT, openSettings);
      window.removeEventListener(OPEN_DATABASE_SAFETY_CENTER_EVENT, openSafety);
    };
  }, [setActiveServerId]);

  const connect = async () => {
    if (!activeServer || !activeToken || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await testStoredDatabaseConnection(activeServer.id, activeToken);
      await fetchServerTables(activeServer.id, activeToken);
      await loadServers();
      setStatus({ tone: 'success', text: `${result.connection?.version || databaseEngineLabel(activeServer.databaseType)} bağlantısı hazır` });
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Bağlantı kurulamadı.' });
    } finally {
      setBusy(false);
    }
  };

  const refreshCatalog = async () => {
    if (!activeServer || !activeToken || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      await fetchServerTables(activeServer.id, activeToken);
      await loadServers();
      setStatus({ tone: 'success', text: 'Katalog yenilendi' });
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Katalog yenilenemedi.' });
    } finally {
      setBusy(false);
    }
  };

  const openSettings = (tab: DatabaseSettingsTab = 'account') => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };
  const openSafety = (tab: DatabaseSafetyCenterTab) => {
    setSafetyTab(tab);
    setSafetySql('');
    setSafetyOpen(true);
  };
  const toolButton = 'flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-[10px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-35';

  return <>
    <div className="coreor-hide-scrollbar flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-zinc-800 bg-zinc-950/95 px-2 text-[11px] text-zinc-400 shadow-sm backdrop-blur">
      <div className="mr-1 flex min-w-44 max-w-64 shrink-0 items-center gap-2">
        <Database className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <SearchSelect value={activeServerId || ''} options={serverOptions} onValueChange={serverId => setActiveServerId(serverId || null)} placeholder="Bağlantı seç" searchPlaceholder="Sunucu, host veya motor ara…" emptyText="Kayıtlı sunucu yok." className="min-w-0 flex-1" triggerClassName="min-h-7 h-7 rounded-lg border-zinc-800/80 bg-black/20 px-2 [&>span]:py-0" dropdownMinWidth={390} showDescriptionInTrigger={false} />
      </div>
      <button type="button" className={toolButton} disabled={!activeServer || busy} onClick={() => void connect()} title="Bağlantıyı test et ve katalogla bağlan">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" /> : <Server className="h-3.5 w-3.5 text-emerald-400" />}Bağlan</button>
      <button type="button" className={toolButton} disabled={!activeServer || busy} onClick={() => void refreshCatalog()} title="Veritabanı kataloğunu yenile"><RefreshCw className="h-3.5 w-3.5" />Yenile</button>
      <span className="mx-1 h-4 w-px shrink-0 bg-zinc-800" />
      <button type="button" className={toolButton} onClick={() => dispatchDatabaseTool(TOGGLE_COMMAND_PALETTE_EVENT)} title="Komut paleti; > ile hızlı SQL"><Command className="h-3.5 w-3.5 text-cyan-400" />Komut<span className="rounded border border-zinc-800 px-1 py-0.5 text-[8px] text-zinc-600">⌘K</span></button>
      <button type="button" className={toolButton} disabled={!activeServer} onClick={() => openSafety('backups')} title="Yedekleme görevleri ve motor komut planları"><HardDriveDownload className="h-3.5 w-3.5 text-emerald-400" />Yedekleme</button>
      <button type="button" className={toolButton} disabled={!activeServer} onClick={() => openSafety('history')} title="Şema geçmişi, migration, approval ve veri araçları"><ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />Güvenlik</button>
      <button type="button" className={toolButton} disabled={!activeServer || !mysqlWorkbench} onClick={() => setTransactionOpen(true)} title={mysqlWorkbench ? 'Autocommit, commit ve rollback' : 'Transaction merkezi bu motor için henüz kullanılamıyor'}><ShieldAlert className="h-3.5 w-3.5 text-amber-400" />Transaction</button>
      <button type="button" className={toolButton} disabled={!activeServer || !mysqlWorkbench} onClick={() => setUsersOpen(true)} title={mysqlWorkbench ? 'Kullanıcı, rol ve yetki yönetimi' : 'Motor özel kullanıcı yönetimi henüz kullanılamıyor'}><UserCog className="h-3.5 w-3.5 text-purple-400" />Kullanıcılar</button>
      <button type="button" className={toolButton} disabled={!activeServer || !mysqlWorkbench} onClick={() => setProcessOpen(true)} title="Çalışan sorgular ve kilitler"><Activity className="h-3.5 w-3.5 text-amber-400" />Processler</button>
      <button type="button" className={toolButton} disabled={!activeServer || !mysqlWorkbench} onClick={() => setPerformanceOpen(true)} title="Canlı motor performansı"><Gauge className="h-3.5 w-3.5 text-emerald-400" />Performans</button>
      <button type="button" className={toolButton} disabled={!activeServer} onClick={() => setNotebookOpen(true)}><BookOpen className="h-3.5 w-3.5 text-purple-400" />Notebook</button>
      <button type="button" className={toolButton} disabled={!activeServer} onClick={() => setTransferOpen(true)}><FileInput className="h-3.5 w-3.5 text-emerald-400" />Aktarım</button>
      <button type="button" className={toolButton} disabled={!activeServer || !selectedDatabase} onClick={() => window.dispatchEvent(new Event('coreor:open-schema-graph'))}><Network className="h-3.5 w-3.5 text-cyan-400" />Şema</button>
      <button type="button" className={toolButton} onClick={() => openSettings('account')}><Settings2 className="h-3.5 w-3.5" />Ayarlar</button>

      {status && <button type="button" className={`ml-2 inline-flex min-w-0 shrink-0 items-center gap-1.5 truncate text-[10px] ${status.tone === 'success' ? 'text-emerald-400' : 'text-red-400'}`} onClick={() => setStatus(null)} title={status.text}>{status.tone === 'success' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}<span className="max-w-64 truncate">{status.text}</span></button>}
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1 pl-3 text-[10px] text-zinc-600"><span className="max-w-40 truncate text-zinc-400">{activeServer ? databaseEngineLabel(activeServer.databaseType) : 'Bağlantı yok'}</span>{selectedDatabase && <><span>›</span><span className="max-w-40 truncate">{selectedDatabase}</span></>}{selectedTable && <><span>›</span><span className="max-w-40 truncate text-cyan-400">{selectedTable}</span></>}</div>
    </div>

    <DatabaseUserManagerModal open={usersOpen} onClose={() => setUsersOpen(false)} serverId={activeServerId} accountId={activeToken} databases={databases} />
    <DatabaseProcessCenterModal open={processOpen} onClose={() => setProcessOpen(false)} serverId={activeServerId} accountId={activeToken} />
    <DatabasePerformancePanelModal open={performanceOpen} onClose={() => setPerformanceOpen(false)} serverId={activeServerId} accountId={activeToken} selectedDatabase={selectedDatabase} />
    <SqlNotebookModal open={notebookOpen} onClose={() => setNotebookOpen(false)} serverId={activeServerId} accountId={activeToken} databases={databases} selectedDatabase={selectedDatabase} />
    <DatabaseImportExportModal open={transferOpen} onClose={() => setTransferOpen(false)} serverId={activeServerId} accountId={activeToken} databases={databases} selectedDatabase={selectedDatabase} selectedTable={selectedTable} />
    <DatabaseSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} initialTab={settingsTab} />
    <DatabaseTransactionWorkspaceModal open={transactionOpen} onClose={() => setTransactionOpen(false)} serverId={activeServerId} accountId={activeToken} databases={databases} selectedDatabase={selectedDatabase} />
    <DatabaseSafetyCenterModal open={safetyOpen} onClose={() => setSafetyOpen(false)} initialTab={safetyTab} servers={servers} activeServerId={activeServerId} accountId={activeToken} databases={databases} selectedDatabase={selectedDatabase} selectedTable={selectedTable} initialSql={safetySql} />
  </>;
}
