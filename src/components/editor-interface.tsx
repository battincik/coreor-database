'use client';

import { useState, useEffect } from 'react';
import { ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Sidebar } from '@/components/sidebar';
import { DatabasePanel } from '@/components/database-panel';
import Topbar from './Topbar';
import BottomBar from './BottomBar';

export default function EditorInterface() {
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('sql-editor');
  const [query, setQuery] = useState('SELECT * FROM users LIMIT 10;');

  const [showTopbar, setShowTopbar] = useState(false);

  useEffect(() => {
    const userAgent = window.navigator.userAgent;
    if (userAgent.includes('CoreorApp')) {
      setShowTopbar(true);
    }
  }, []);

  const handleDatabaseSelect = (dbName: string) => {
    setSelectedDatabase(dbName);
    setActiveTab('database');
  };

  const handleTableSelect = (tableName: string | null) => {
    setSelectedTable(tableName);
    if (tableName) {
      if (activeTab === 'table-data') {
        setActiveTab('table-data');
      } else {
        setActiveTab('table');
      }
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {showTopbar && <Topbar />}
      <div className="flex-1 flex flex-col overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
            <Sidebar onDatabaseSelect={handleDatabaseSelect} onTableSelect={handleTableSelect} selectedDatabase={selectedDatabase} selectedTable={selectedTable} />
          </ResizablePanel>
          <ResizablePanel defaultSize={80} className="overflow-hidden">
            <DatabasePanel selectedDatabase={selectedDatabase} selectedTable={selectedTable} activeTab={activeTab} setActiveTab={setActiveTab} query={query} setQuery={setQuery} onDatabaseSelect={handleDatabaseSelect} onTableSelect={handleTableSelect} />
          </ResizablePanel>
        </ResizablePanelGroup>
        <BottomBar />
      </div>
    </div>
  );
}
