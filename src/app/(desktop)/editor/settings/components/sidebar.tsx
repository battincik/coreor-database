'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Search, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/context/LanguageContext';
import { settingsItems, iconMap, routeMap } from '@/lib/settingsConfig';

function safeIcon(item: string) {
  const icon = iconMap[item];
  if (React.isValidElement(icon) && icon.type) return icon;
  return <Settings className="h-4 w-4" />;
}

export function SettingsSidebar({ activeTab }: { activeTab?: string }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredItems = useMemo(
    () =>
      settingsItems
        .map(section => ({
          ...section,
          items: section.items.filter(item => t(item, item).toLocaleLowerCase('tr-TR').includes(searchQuery.toLocaleLowerCase('tr-TR')))
        }))
        .filter(section => section.items.length > 0),
    [searchQuery, t]
  );

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col overflow-hidden border-r border-zinc-800 bg-zinc-950">
      <div className="shrink-0 border-b border-zinc-800 p-2">
        <div className="flex items-center gap-2 px-1 py-1">
          <Button variant="ghost" size="icon" onClick={() => router.push('/editor')} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">{t('settingsSidebar.backToEditor')}</span>
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <Settings className="h-4 w-4 text-emerald-400" />
            <div>
              <h2 className="text-sm font-semibold">{t('app.settings')}</h2>
              <p className="text-[10px] text-muted-foreground">{t('settingsSidebar.subtitle')}</p>
            </div>
          </div>
        </div>

        <div className="relative mt-2">
          <Input placeholder={`${t('common.search')}…`} value={searchQuery} onChange={event => setSearchQuery(event.target.value)} className="h-8 pr-8 text-xs" />
          <Search className="absolute right-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-2">
          {filteredItems.length === 0 && <div className="rounded-lg border border-dashed border-zinc-800 px-3 py-6 text-center text-xs text-muted-foreground">{t('settingsSidebar.noResults')}</div>}
          {filteredItems.map(section => (
            <div key={section.category}>
              <h3 className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">{t(section.category, section.category)}</h3>
              <div className="space-y-0.5">
                {section.items.map(item => (
                  <Button
                    key={item}
                    variant="ghost"
                    className={`h-8 w-full justify-start gap-2 px-2 text-xs ${activeTab === item ? 'bg-muted/50 text-primary' : 'text-zinc-400 hover:text-zinc-100'}`}
                    onClick={() => router.push(routeMap[item] || '/editor/settings')}
                  >
                    {safeIcon(item)}
                    <span className="truncate">{t(item, item)}</span>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

    </aside>
  );
}
