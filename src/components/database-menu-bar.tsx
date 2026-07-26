'use client';

import React, { useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Code,
  Command,
  Database,
  FileInput,
  FileOutput,
  Gauge,
  Loader2,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Settings2,
  Unplug,
  UserCog,
  Users,
  XCircle
} from 'lucide-react';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useAuth } from '@/context/AuthContext';
import { fetchServerTables, testStoredDatabaseConnection } from '@/lib/databaseApi';
import { openQueryTab } from '@/lib/queryWorkspaceEvents';
import {
  OPEN_IMPORT_EXPORT_EVENT,
  OPEN_PERFORMANCE_PANEL_EVENT,
  OPEN_PROCESS_CENTER_EVENT,
  OPEN_SQL_NOTEBOOK_EVENT,
  OPEN_USER_MANAGER_EVENT,
  TOGGLE_COMMAND_PALETTE_EVENT,
  dispatchDatabaseTool
} from '@/lib/databaseToolEvents';
import { DatabaseUserManagerModal } from '@/components/database-user-manager-modal';
import { DatabaseProcessCenterModal } from '@/components/database-process-center-modal';
import { DatabaseImportExportModal } from '@/components/database-import-export-modal';
import { DatabasePerformancePanelModal } from '@/components/database-performance-panel-modal';
import { SqlNotebookModal } from '@/components/sql-notebook-modal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

interface DatabaseMenuBarProps {
  selectedDatabase: string | null;
  selectedTable: string | null;
}

export function DatabaseMenuBar({ selectedDatabase, selectedTable }: DatabaseMenuBarProps) {
  const router = useRouter();
  const { activeToken } = useAuth();
  const { servers, databases, activeServerId, setActiveServerId, loadServers } = useContext(DatabaseContext)!;
  const activeServer = servers.find(server => server.id === activeServerId) ?? null;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [usersOpen, setUsersOpen] = useState(false);
  const [processOpen, setProcessOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [performanceOpen, setPerformanceOpen] = useState(false);
  const [notebookOpen, setNotebookOpen] = useState(false);

  useEffect(() => {
    const openUsers = () => setUsersOpen(true);
    const openProcesses = () => setProcessOpen(true);
    const openTransfer = () => setTransferOpen(true);
    const openPerformance = () => setPerformanceOpen(true);
    const openNotebook = () => setNotebookOpen(true);
    window.addEventListener(OPEN_USER_MANAGER_EVENT, openUsers);
    window.addEventListener(OPEN_PROCESS_CENTER_EVENT, openProcesses);
    window.addEventListener(OPEN_IMPORT_EXPORT_EVENT, openTransfer);
    window.addEventListener(OPEN_PERFORMANCE_PANEL_EVENT, openPerformance);
    window.addEventListener(OPEN_SQL_NOTEBOOK_EVENT, openNotebook);
    return () => {
      window.removeEventListener(OPEN_USER_MANAGER_EVENT, openUsers);
      window.removeEventListener(OPEN_PROCESS_CENTER_EVENT, openProcesses);
      window.removeEventListener(OPEN_IMPORT_EXPORT_EVENT, openTransfer);
      window.removeEventListener(OPEN_PERFORMANCE_PANEL_EVENT, openPerformance);
      window.removeEventListener(OPEN_SQL_NOTEBOOK_EVENT, openNotebook);
    };
  }, []);

  const connect = async () => {
    if (!activeServer || !activeToken || busy) return;
    setBusy(true); setStatus(null);
    try {
      const result = await testStoredDatabaseConnection(activeServer.id, activeToken);
      await fetchServerTables(activeServer.id, activeToken);
      await loadServers();
      setStatus({ tone: 'success', text: `${result.connection?.version || 'Sunucu'} bağlantısı hazır` });
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Bağlantı kurulamadı.' });
    } finally { setBusy(false); }
  };

  const refreshCatalog = async () => {
    if (!activeServer || !activeToken || busy) return;
    setBusy(true); setStatus(null);
    try {
      await fetchServerTables(activeServer.id, activeToken);
      await loadServers();
      setStatus({ tone: 'success', text: 'Katalog yenilendi' });
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Katalog yenilenemedi.' });
    } finally { setBusy(false); }
  };

  const toolButton = 'flex h-7 items-center gap-1.5 rounded px-2 text-[10px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40';

  return (
    <>
      <div className="flex h-8 shrink-0 items-center border-b border-zinc-800 bg-zinc-950/95 px-2 text-[11px] text-zinc-400 shadow-sm backdrop-blur">
        <div className="mr-3 flex items-center gap-1.5 font-semibold text-zinc-200"><Database className="h-3.5 w-3.5 text-emerald-400" />Coreor Database</div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" className="flex h-7 items-center gap-1 rounded px-2 text-zinc-300 hover:bg-white/[0.06] data-[state=open]:bg-white/[0.08]">Veritabanı <ChevronDown className="h-3 w-3 text-zinc-600" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 text-xs">
            <DropdownMenuLabel className="text-[10px] font-normal text-zinc-500">Bağlantılar</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => window.dispatchEvent(new Event('coreor:open-server-modal'))}><Plus className="mr-2 h-4 w-4" /> Yeni bağlantı ekle<span className="ml-auto text-[10px] text-zinc-600">⌘N</span></DropdownMenuItem>
            <DropdownMenuItem disabled={!activeServer} onClick={() => activeServer && window.dispatchEvent(new CustomEvent('coreor:edit-server-modal', { detail: { serverId: activeServer.id } }))}><Pencil className="mr-2 h-4 w-4" /> Aktif bağlantıyı düzenle</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!activeServer || busy} onClick={() => void connect()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Server className="mr-2 h-4 w-4" />} Bağlantıyı test et ve bağlan</DropdownMenuItem>
            <DropdownMenuItem disabled={!activeServer || busy} onClick={() => void refreshCatalog()}><RefreshCw className="mr-2 h-4 w-4" /> Kataloğu yenile</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!activeServer} onClick={() => openQueryTab({ serverId: activeServerId, databaseName: null, title: 'Genel sorgu' })}><Code className="mr-2 h-4 w-4" /> Yeni sunucu geneli sorgu</DropdownMenuItem>
            <DropdownMenuItem disabled={!activeServer || !selectedDatabase} onClick={() => openQueryTab({ serverId: activeServerId, databaseName: selectedDatabase, title: `${selectedDatabase} sorgu` })}><Database className="mr-2 h-4 w-4" /> Seçili veritabanında sorgu</DropdownMenuItem>
            <DropdownMenuItem disabled={!activeServer || !selectedDatabase} onClick={() => window.dispatchEvent(new Event('coreor:open-schema-graph'))}><Network className="mr-2 h-4 w-4" /> Şema grafiğini aç</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="font-normal"><div className="flex items-center gap-2 text-[10px] text-zinc-500"><Unplug className="h-3.5 w-3.5" /><select value={activeServerId || ''} onChange={event => setActiveServerId(event.target.value || null)} className="h-7 min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 text-[10px] text-zinc-300"><option value="">Bağlantı seç</option>{servers.map(server => <option key={server.id} value={server.id}>{server.name} — {server.host}:{server.port || 3306}</option>)}</select></div></DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" className="flex h-7 items-center gap-1 rounded px-2 text-zinc-300 hover:bg-white/[0.06] data-[state=open]:bg-white/[0.08]">Yönetim <ChevronDown className="h-3 w-3 text-zinc-600" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 text-xs">
            <DropdownMenuItem disabled={!activeServer} onClick={() => setUsersOpen(true)}><Users className="mr-2 h-4 w-4" /> Kullanıcılar, roller ve yetkiler</DropdownMenuItem>
            <DropdownMenuItem disabled={!activeServer} onClick={() => setProcessOpen(true)}><Activity className="mr-2 h-4 w-4" /> Process ve kilit merkezi</DropdownMenuItem>
            <DropdownMenuItem disabled={!activeServer} onClick={() => setPerformanceOpen(true)}><Gauge className="mr-2 h-4 w-4" /> Performans paneli</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!activeServer} onClick={() => setNotebookOpen(true)}><BookOpen className="mr-2 h-4 w-4" /> SQL Notebook</DropdownMenuItem>
            <DropdownMenuItem disabled={!activeServer} onClick={() => setTransferOpen(true)}><FileInput className="mr-2 h-4 w-4" /> Gelişmiş içe aktarma</DropdownMenuItem>
            <DropdownMenuItem disabled={!activeServer} onClick={() => setTransferOpen(true)}><FileOutput className="mr-2 h-4 w-4" /> Gelişmiş dışa aktarma</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button type="button" className={toolButton} onClick={() => dispatchDatabaseTool(TOGGLE_COMMAND_PALETTE_EVENT)} title="Komut paleti (Ctrl/Cmd + K)"><Command className="h-3.5 w-3.5 text-cyan-400" />Komut<span className="rounded border border-zinc-800 px-1 py-0.5 text-[8px] text-zinc-600">⌘K</span></button>
        <button type="button" className={toolButton} disabled={!activeServer} onClick={() => setUsersOpen(true)} title="MySQL kullanıcı ve yetki yönetimi"><UserCog className="h-3.5 w-3.5 text-purple-400" />Kullanıcılar</button>
        <button type="button" className={toolButton} disabled={!activeServer} onClick={() => setProcessOpen(true)} title="Çalışan sorgular ve kilitler"><Activity className="h-3.5 w-3.5 text-amber-400" />Processler</button>
        <button type="button" className={toolButton} disabled={!activeServer} onClick={() => setPerformanceOpen(true)} title="QPS, buffer pool, replication ve depolama"><Gauge className="h-3.5 w-3.5 text-emerald-400" />Performans</button>
        <button type="button" className={toolButton} disabled={!activeServer} onClick={() => setNotebookOpen(true)} title="SQL, Markdown, sonuç ve grafik notebook'u"><BookOpen className="h-3.5 w-3.5 text-purple-400" />Notebook</button>
        <button type="button" className={toolButton} disabled={!activeServer} onClick={() => setTransferOpen(true)} title="CSV, JSON ve SQL aktarımı"><FileInput className="h-3.5 w-3.5 text-emerald-400" />Aktarım</button>
        <button type="button" className={toolButton} disabled={!activeServer || !selectedDatabase} onClick={() => window.dispatchEvent(new Event('coreor:open-schema-graph'))} title="ER / flow şeması"><Network className="h-3.5 w-3.5 text-cyan-400" />Şema</button>
        <button type="button" className={toolButton} onClick={() => router.push('/editor/settings/appearance')} title="Görünüm ve uygulama ayarları"><Settings2 className="h-3.5 w-3.5" />Ayarlar</button>

        {status && <button type="button" className={`ml-3 inline-flex min-w-0 items-center gap-1.5 truncate text-[10px] ${status.tone === 'success' ? 'text-emerald-400' : 'text-red-400'}`} onClick={() => setStatus(null)} title={status.text}>{status.tone === 'success' ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0" />}<span className="max-w-80 truncate">{status.text}</span></button>}

        <div className="ml-auto flex min-w-0 items-center gap-1 text-[10px] text-zinc-600">{busy && <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />}<span className="max-w-48 truncate text-zinc-400">{activeServer?.name || 'Bağlantı yok'}</span>{selectedDatabase && <><span>›</span><span className="max-w-40 truncate">{selectedDatabase}</span></>}{selectedTable && <><span>›</span><span className="max-w-40 truncate text-cyan-400">{selectedTable}</span></>}</div>
      </div>

      <DatabaseUserManagerModal open={usersOpen} onClose={() => setUsersOpen(false)} serverId={activeServerId} accountId={activeToken} databases={databases} />
      <DatabaseProcessCenterModal open={processOpen} onClose={() => setProcessOpen(false)} serverId={activeServerId} accountId={activeToken} />
      <DatabasePerformancePanelModal open={performanceOpen} onClose={() => setPerformanceOpen(false)} serverId={activeServerId} accountId={activeToken} selectedDatabase={selectedDatabase} />
      <SqlNotebookModal open={notebookOpen} onClose={() => setNotebookOpen(false)} serverId={activeServerId} accountId={activeToken} databases={databases} selectedDatabase={selectedDatabase} />
      <DatabaseImportExportModal open={transferOpen} onClose={() => setTransferOpen(false)} serverId={activeServerId} accountId={activeToken} databases={databases} selectedDatabase={selectedDatabase} selectedTable={selectedTable} />
    </>
  );
}
