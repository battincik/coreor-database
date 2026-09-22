'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { SettingsSidebar } from './sidebar';

export function SettingsPageShell({
  activeTab,
  icon: Icon,
  eyebrow,
  title,
  description,
  children
}: {
  activeTab: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SettingsSidebar activeTab={activeTab} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-6 p-5 lg:p-8">
          <header>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400"><Icon className="h-4 w-4" />{eyebrow}</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}

export function SettingsSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card/70 shadow-sm">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

export function SettingRow({ title, description, control }: { title: string; description?: string; control: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-background/35 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><div className="text-xs font-medium">{title}</div>{description && <div className="mt-1 text-[11px] leading-4 text-muted-foreground">{description}</div>}</div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export const settingControlClass = 'h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-primary';
