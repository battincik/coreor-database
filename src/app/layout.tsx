import React from 'react';
import type { Metadata } from 'next';
import './globals.css';
import './preferences-overrides.css';
import './coreor-workbench.css';
import { Providers } from './providers';
import { AppPreferenceBridge } from '@/components/app-preference-bridge';

export const metadata: Metadata = {
  title: 'Coreor.net - Database',
  description: 'Coreor.net - Database'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr" dir="ltr" suppressHydrationWarning><body><Providers><AppPreferenceBridge />{children}</Providers></body></html>;
}
