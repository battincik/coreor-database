'use client';

import { NativeRuntimeGuard } from '@/components/native-runtime-guard';

export default function DesktopLayout({ children }: { children: React.ReactNode }) {
  return <NativeRuntimeGuard>{children}</NativeRuntimeGuard>;
}
