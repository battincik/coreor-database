'use client';

import React from 'react';
import { SettingsSidebar } from '../components/sidebar';
import { SettingsPageSkeleton } from '@/components/app-state';

export default function Loading() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SettingsSidebar />
      <SettingsPageSkeleton />
    </div>
  );
}
