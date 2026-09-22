'use client';

import React from 'react';
import type { AccountCapability } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';

export function AccountCapabilityGate({
  capability,
  children,
  fallback = null
}: {
  capability: AccountCapability;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const auth = useAuth();
  return auth.hasCapability(capability) ? <>{children}</> : <>{fallback}</>;
}
