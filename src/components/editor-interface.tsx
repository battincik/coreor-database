'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { Code, Network, Plus, RefreshCw, Server, Settings2, Table2 } from 'lucide-react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import Sidebar from '@/components/sidebar';
import { DatabasePanel } from '@/components/database-panel';
import { DatabaseMenuBar } from '@/components/database-menu-bar';
import { DatabaseCommandPalette } from '@/components/database-command-palette';
import { EditorPanelErrorBoundary } from '@/components/editor-panel-error-boundary';
import { CoreorToastProvider } from '@/components/ui/coreor-toast';
import { DatabaseNotificationMonitor } from '@/components/database-notification-monitor';
import { RuntimeCompatibility } from '@/components/runtime-compatibility';
import BottomBar from './BottomBar';
import { AppContextMenuProvider, useAppContextMenu } from '@/components/app-context-menu';
import { DatabaseContext } from '@/context/DatabaseContext';
import { openQueryTab } from '@/lib/queryWorkspaceEvents';
import { setAppPreferences, useAppPreferences } from '@/lib/appPreferences';
import { OPEN_SETTINGS_MODAL_EVENT, TOGGLE_COMMAND_PALETTE_EVENT } from '@/lib/databaseToolEvents';
import { matchesShortcut } from '@/lib/shortcuts';

function EditorWorkspace() {
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('sql-editor');
  const [query, setQuery] = useState('SELECT * FROM users LIMIT 10;');
  const lastTableView = useRef<'table' | 'table-data'>('table-data');
  const panelSaveTimer = useRef<number | null>(null);
  const { openContextMenu } = useAppContextMenu();
  const { preferences } = useAppPreferences();
  const { activeServerId, servers } = useContext(DatabaseContext)!;
  const activeServer = servers.find(server => server.id === activeServerId) ?? null;

  useEffect(() => {
    return () => {
      if (panelSaveTimer.current) window.clearTimeout(panelSaveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'table' || activeTab === 'table-data') lastTableView.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (matchesShortcut(event, 'newQuery')) {
        event.preventDefault();
        if (activeServer) openQueryTab({ serverId: activeServerId, databaseName: selectedDatabase, title: selectedDatabase ? `${selectedDatabase} sorgu` : 'Genel sorgu' });
      } else if (matchesShortcut(event, 'settings')) {
        event.preventDefault();
        window.dispatchEvent(new Event(OPEN_SETTINGS_MODAL_EVENT));
      } else if (matchesShortcut(event, 'backupCenter')) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('coreor:open-automation-center', { detail: { tab: 'backups' } }));
      } else if (matchesShortcut(event, 'automationCenter')) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('coreor:open-automation-center', { detail: { tab: 'history' } }));
      } else if (matchesShortcut(event, 'refresh')) {
        event.preventDefault();
        window.dispatchEvent(new Event('coreor:refresh-active-view'));
      } else if (matchesShortcut(event, 'insertRow') && selectedDatabase && selectedTable && !activeServer?.readOnly) {
        event.preventDefault();
        setActiveTab('table-data');
        window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('coreor:request-insert-table-row', { detail: { databaseName: selectedDatabase, tableName: selectedTable } })));
      } else if (matchesShortcut(event, 'find')) {
        const target = event.target as HTMLElement | null;
        if (target?.closest('.coreor-sql-editor-stack')) return;
        event.preventDefault();
        window.dispatchEvent(new Event('coreor:focus-object-search'));
      } else if (matchesShortcut(event, 'closeTab') && activeTab.startsWith('query:')) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('coreor:close-query-tab', { detail: { id: activeTab.slice(6) } }));
      } else if (matchesShortcut(event, 'duplicateTab') && activeTab.startsWith('query:')) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('coreor:duplicate-query-tab', { detail: { id: activeTab.slice(6) } }));
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [activeServer, activeServerId, selectedDatabase, selectedTable, activeTab]);

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
      onContextMenu={event =>
        openContextMenu(
          event,
          [
            {
              id: 'new-global-query',
              label: 'Yeni sunucu geneli sorgu',
              icon: Code,
              disabled: !activeServer,
              onSelect: () => { openQueryTab({ serverId: activeServerId, databaseName: null, title: 'Genel sorgu' }); }
            },
            {
              id: 'new-database-query',
              label: selectedDatabase ? `${selectedDatabase} için yeni sorgu` : 'Veritabanı sorgusu',
              icon: Plus,
              disabled: !activeServer || !selectedDatabase,
              onSelect: () => { openQueryTab({ serverId: activeServerId, databaseName: selectedDatabase, title: selectedDatabase || 'Sorgu' }); }
            },
            {
              id: 'open-table',
              label: selectedTable ? `${selectedTable} verilerini aç` : 'Tablo verileri',
              icon: Table2,
              disabled: !selectedTable,
              onSelect: () => { setActiveTab('table-data'); }
            },
            {
              id: 'open-schema',
              label: selectedDatabase ? `${selectedDatabase} şema grafiği` : 'Şema grafiği',
              icon: Network,
              disabled: !selectedDatabase,
              onSelect: () => { setActiveTab('schema-graph'); }
            },
            { id: 'separator-1', separator: true },
            {
              id: 'commands',
              label: 'Komut paletini aç',
              icon: Code,
              shortcut: 'commandPalette',
              onSelect: () => window.dispatchEvent(new Event(TOGGLE_COMMAND_PALETTE_EVENT))
            },
            {
              id: 'settings',
              label: 'Ayarları aç',
              icon: Settings2,
              onSelect: () => window.dispatchEvent(new Event(OPEN_SETTINGS_MODAL_EVENT))
            },
            {
              id: 'refresh-view',
              label: 'Aktif görünümü yenile',
              icon: RefreshCw,
              disabled: !activeServer,
              onSelect: () => { window.dispatchEvent(new Event('coreor:refresh-active-view')); }
            },
            {
              id: 'add-server',
              label: 'Yeni sunucu ekle',
              icon: Server,
              onSelect: () => { window.dispatchEvent(new Event('coreor:open-server-modal')); }
            }
          ],
          activeServer ? `${activeServer.name} çalışma alanı` : 'Coreor Database'
        )
      }
    >
      <RuntimeCompatibility />
      <DatabaseNotificationMonitor />
      <div data-coreor-app-chrome="top" className="relative z-[2147483000] shrink-0">
        <DatabaseMenuBar selectedDatabase={selectedDatabase} selectedTable={selectedTable} />
      </div>
      <DatabaseCommandPalette servers={servers} activeServerId={activeServerId} selectedDatabase={selectedDatabase} selectedTable={selectedTable} onDatabaseSelect={handleDatabaseSelect} onTableSelect={handleTableSelect} />
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
        <div data-coreor-app-chrome="bottom" className="relative z-[2147483000] shrink-0">
          <BottomBar selectedDatabase={selectedDatabase} selectedTable={selectedTable} />
        </div>
      </div>
    </div>
  );
}

export default function EditorInterface() {
  return (
    <CoreorToastProvider>
      <AppContextMenuProvider>
        <EditorWorkspace />
      </AppContextMenuProvider>
    </CoreorToastProvider>
  );
}
