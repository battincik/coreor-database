'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CoreorLoadingScreen } from '@/components/coreor-loading-screen';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => { router.replace('/editor'); }, [router]);
  return <CoreorLoadingScreen />;
}
