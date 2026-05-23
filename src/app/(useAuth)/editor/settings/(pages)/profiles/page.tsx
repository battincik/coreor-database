'use client';

import React from 'react';
import { SettingsSidebar } from '../../components/sidebar';

export default function SettingsPage() {
  return (
    <div className="flex h-screen">
      <SettingsSidebar activeTab="profiles" />
      <div className="flex-1 p-4">
        <h1 className="text-2xl font-bold">Profiles Settings</h1>
        <p className="text-muted-foreground">This is the profiles settings content.</p>
      </div>
    </div>
  );
}
