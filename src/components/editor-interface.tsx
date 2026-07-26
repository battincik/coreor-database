'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { Code, Plus, RefreshCw, Server } from 'lucide-react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Sidebar } from '@/components/sidebar';
import { DatabasePanel } from '@/components/database-panel';
import { DatabaseMenuBar } from '@/components/database-menu-bar';
import { DatabaseCommandPalette } from '@/components/database-command-palette';
import { EditorPanelErrorBoundary } from '@/components/editor-panel-error-boundary';
import { BottomBarGuide } from '@/components/bottom-bar-guide';
import Topbar from './Topbar';
import BottomBar from './BottomBar';
import { AppContextMenuProvider, useAppContextMenu } from '@/components/app-context-menu';
import { DatabaseContext } from '@/context/DatabaseContext';
import { openQueryTab } from '@/lib/queryWorkspaceEvents';
import { setAppPreferences, useAppPreferences } from '@/lib/appPreferences';

function EditorWorkspace() {
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('sql-editor');
  const [query, setQuery] = useState('SELECT * FROM users LIMIT 10;');
  const [showTopbar, setShowTopbar] = useState(false);
  const lastTableView = useRef<'table' | 'table-data'>('table-data');
  const panelSaveTimer = useRef<number | null>(null);
  const { openContextMenu } = useAppContextMenu();
  const { preferences } = useAppPreferences();
  const { activeServerId, servers } = useContext(DatabaseContext)!;
  const activeServer = servers.find(server => server.id === activeServerId) ?? null;

  useEffect(() => {
    if (window.navigator.userAgent.includes('CoreorApp')) setShowTopbar(true);
    return () => { if (panelSaveTimer.current) window.clearTimeout(panelSaveTimer.current); };
  }, []);

  useEffect(() => {
    if (activeTab === 'table' || activeTab === 'table-data') lastTableView.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const handler = (event: Event) => {
      const view = (event as CustomEvent<{ view?: 'structure' | 'data' }>).detail?.view;
      if (view === 'data') {
        lastTableView.current = 'table-data';
        setActiveTab('table-data');
      }
      if (view === 'structure') {
        lastTableView.current = 'table';
        setActiveTab('table');
      }
    };
    window.addEventListener('coreor:open-table-view', handler);
    return () => window.removeEventListener('coreor:open-table-view', handler);
  }, []);

  useEffect(() => {
    const openGraph = () => {
      if (selectedDatabase) setActiveTab('schema-graph');
    };
    window.addEventListener('coreor:open-schema-graph', openGraph);
    return () => window.removeEventListener('coreor:open-schema-graph', openGraph);
  }, [selectedDatabase]);

  const handleDatabaseSelect = (databaseName: string | null) => {
    setSelectedDatabase(databaseName);
    setSelectedTable(null);
    setActiveTab(databaseName ? 'database' : 'sql-editor');
  };

  const handleTableSelect = (tableName: string | null) => {
    setSelectedTable(tableName);
    if (tableName) setActiveTab(lastTableView.current);
  };

  const rememberLayout = (sizes: number[]) => {
    if (!preferences.rememberPanelSizes || !Number.isFinite(sizes[0])) return;
    if (panelSaveTimer.current) window.clearTimeout(panelSaveTimer.current);
    panelSaveTimer.current = window.setTimeout(() => setAppPreferences({ sidebarSize: sizes[0] }), 180);
  };

  const panelResetKey = `${activeServerId || 'none'}:${activeTab}:${selectedDatabase || ''}:${selectedTable || ''}`;

  return (
    <div
      className="flex h-screen flex-col"
      onContextMenu={event => openContextMenu(
        event,
        [
          {
            id: 'new-global-query',
            label: 'Yeni sunucu geneli sorgu',
            icon: Code,
            disabled: !activeServer,
            onSelect: () => openQueryTab({ serverId: activeServerId, databaseName: null, title: 'Genel sorgu' })
          },
          {
            id: 'new-database-query',
            label: selectedDatabase ? `${selectedDatabase} için yeni sorgu` : 'Veritabanı sorgusu',
            icon: Plus,
            disabled: !activeServer || !selectedDatabase,
            onSelect: () => openQueryTab({ serverId: activeServerId, databaseName: selectedDatabase, title: selectedDatabase || 'Sorgu' })
          },
          { id: 'separator-1', separator: true },
          {
            id: 'refresh-view',
            label: 'Aktif görünümü yenile',
            icon: RefreshCw,
            disabled: !activeServer,
            onSelect: () => window.dispatchEvent(new Event('coreor:refresh-active-view'))
          },
          {
            id: 'add-server',
            label: 'Yeni sunucu ekle',
            icon: Server,
            onSelect: () => window.dispatchEvent(new Event('coreor:open-server-modal'))
          }
        ],
        activeServer ? `${activeServer.name} çalışma alanı` : 'Coreor Database'
      )}
    >
      {showTopbar && <Topbar />}
      <DatabaseMenuBar selectedDatabase={selectedDatabase} selectedTable={selectedTable} />
      <DatabaseCommandPalette
        servers={servers}
        activeServerId={activeServerId}
        selectedDatabase={selectedDatabase}
        selectedTable={selectedTable}
        onDatabaseSelect={handleDatabaseSelect}
        onTableSelect={handleTableSelect}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1 overflow-hidden" onLayout={rememberLayout}>
          <ResizablePanel defaultSize={preferences.sidebarSize} minSize={12} maxSize={45}>
            <Sidebar onDatabaseSelect={handleDatabaseSelect} onTableSelect={handleTableSelect} selectedDatabase={selectedDatabase} selectedTable={selectedTable} />
          </ResizablePanel>
          <ResizableHandle withHandle className="z-30 w-1 bg-zinc-900 hover:bg-cyan-500/40 data-[resize-handle-active]:bg-cyan-500/60" />
          <ResizablePanel defaultSize={100 - preferences.sidebarSize} minSize={45} className="overflow-hidden">
            <EditorPanelErrorBoundary resetKey={panelResetKey}>
              <DatabasePanel selectedDatabase={selectedDatabase} selectedTable={selectedTable} activeTab={activeTab} setActiveTab={setActiveTab} query={query} setQuery={setQuery} onDatabaseSelect={handleDatabaseSelect} onTableSelect={handleTableSelect} />
            </EditorPanelErrorBoundary>
          </ResizablePanel>
        </ResizablePanelGroup>
        <div className="relative shrink-0">
          <BottomBar selectedDatabase={selectedDatabase} selectedTable={selectedTable} />
          <BottomBarGuide selectedDatabase={selectedDatabase} selectedTable={selectedTable} />
        </div>
      </div>
    </div>
  );
}

export default function EditorInterface() {
  return (
    <AppContextMenuProvider>
      <EditorWorkspace />
    </AppContextMenuProvider>
  );
}
