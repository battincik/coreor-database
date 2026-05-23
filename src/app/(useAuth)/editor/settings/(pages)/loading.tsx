'use client';

import React from 'react';
import { SettingsSidebar } from '../components/sidebar';

export default function Loading() {
  return (
    <div className="flex h-screen">
      <SettingsSidebar />
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-primary border-solid"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    </div>
  );
}
