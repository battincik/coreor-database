'use client';

import React from 'react';
import { useAppPreferences } from '@/lib/appPreferences';

export function AppPreferenceBridge() {
  useAppPreferences();
  return (
    <svg aria-hidden="true" className="pointer-events-none fixed h-0 w-0 overflow-hidden">
      <filter id="coreor-protanopia"><feColorMatrix values="0.567 0.433 0 0 0 0.558 0.442 0 0 0 0 0.242 0.758 0 0 0 0 0 1 0" /></filter>
      <filter id="coreor-deuteranopia"><feColorMatrix values="0.625 0.375 0 0 0 0.7 0.3 0 0 0 0 0.3 0.7 0 0 0 0 0 1 0" /></filter>
      <filter id="coreor-tritanopia"><feColorMatrix values="0.95 0.05 0 0 0 0 0.433 0.567 0 0 0 0.475 0.525 0 0 0 0 0 1 0" /></filter>
    </svg>
  );
}
