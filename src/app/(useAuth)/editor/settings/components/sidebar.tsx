'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LogOut, ArrowLeft, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/context/LanguageContext';
import { settingsItems, iconMap, routeMap } from '@/lib/settingsConfig';

export function SettingsSidebar({ activeTab }: { activeTab?: string }) {
  const router = useRouter();
  const { translations } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredItems = settingsItems.map(section => ({
    ...section,
    items: section.items.filter(item => translations[item]?.toLowerCase().includes(searchQuery.toLowerCase()))
  }));

  return (
    <div className="flex flex-col h-full w-72 border-r border-zinc-700 dark:bg-zinc-950 overflow-hidden">
      <div className="flex-shrink-0 py-2 border-b border-zinc-700">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={() => router.push('/editor')} className="mr-2">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-lg font-semibold">{translations.settings || 'Settings'}</h2>
          </div>
        </div>
        <div className="p-2">
          <div className="relative">
            <Input placeholder={translations.search || 'Search'} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="h-8 text-sm" />
            <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredItems.map(
            section =>
              section.items.length > 0 && (
                <div key={section.category}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase m-2">{translations[section.category]}</h3>
                  {section.items.map(item => (
                    <Button key={item} variant="ghost" className={`w-full flex items-center gap-2 justify-start text-sm ${activeTab === item ? 'bg-muted/30 text-primary' : ''}`} onClick={() => router.push(routeMap[item] || '/')}>
                      {iconMap[item]}
                      {translations[item] || item}
                    </Button>
                  ))}
                </div>
              )
          )}
          <Button variant="ghost" className="w-full flex items-center gap-2 justify-start text-sm text-red-500" onClick={() => router.push('/logout')}>
            <LogOut className="h-4 w-4" />
            {translations.logout || 'Log Out'}
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}
