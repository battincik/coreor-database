import React from 'react';
import { SettingsSidebar } from '../../components/sidebar';

export default async function SettingsPage() {
  return (
    <div className="flex h-screen">
      <SettingsSidebar activeTab="accessibility" />
      <div className="flex-1 p-4">
        <h1 className="text-2xl font-bold">Accessibility</h1>
        <p className="text-muted-foreground">This is the accessibility settings content.</p>
      </div>
    </div>
  );
}
