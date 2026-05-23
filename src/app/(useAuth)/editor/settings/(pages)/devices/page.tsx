'use client';

import React from 'react';
import { SettingsSidebar } from '../../components/sidebar';

export default function SettingsPage() {
  return (
    <div className="flex h-screen">
      <SettingsSidebar activeTab="devices" />
      <div className="flex-1 p-4">
        <h1 className="text-2xl font-bold">Devices Settings</h1>
        <p className="text-muted-foreground">This is the devices settings content.</p>
      </div>
    </div>
  );
}
