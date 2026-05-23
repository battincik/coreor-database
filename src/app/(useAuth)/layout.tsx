'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/context/LanguageContext';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { status, data: session } = useSession();
  const { translations } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-primary border-solid"></div>
          <p className="mt-4 text-muted-foreground">{translations.loading}</p>
        </div>
      </div>
    );
  }
  if (session) {
    return <>{children}</>;
  }
}
