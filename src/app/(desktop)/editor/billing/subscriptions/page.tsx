'use client';

import React from 'react';
import { SettingsSidebar } from '../../settings/components/sidebar';

export default function SettingsPage() {
  return (
    <div className="flex h-screen">
      <SettingsSidebar activeTab="subscriptions" />
      <div className="flex-1 p-4">
        <h1 className="text-2xl font-bold">Subscriptions</h1>
        <p className="text-muted-foreground">This is the subscriptions settings content.</p>
      </div>
    </div>
  );
}
