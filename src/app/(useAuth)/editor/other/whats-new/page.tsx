'use client';

import React from 'react';
import { SettingsSidebar } from '../../settings/components/sidebar';

export default function SettingsPage() {
  return (
    <div className="flex h-screen">
      <SettingsSidebar activeTab="whats-new" />
      <div className="flex-1 p-4">
        <h1 className="text-2xl font-bold">What&apos;s New</h1>
        <p className="text-muted-foreground">This is the what&apos;s new settings content.</p>
      </div>
    </div>
  );
}
