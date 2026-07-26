'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { CoreorLoadingScreen } from '@/components/coreor-loading-screen';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { status, data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status === 'loading') {
    return <CoreorLoadingScreen title="Oturum doğrulanıyor" description="GitHub oturumu ve şifreli veritabanı kasası hazırlanıyor." />;
  }
  if (session) return <>{children}</>;
  return null;
}
