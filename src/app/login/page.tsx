'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { IconBrandGithub } from '@tabler/icons-react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { HandleLoginOptions, ProviderType } from 'types';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/editor';
  const reason = searchParams.get('reason');
  const sessionNeedsRefresh = reason === 'session-invalid' || reason === 'session-expired';

  const handleLogin = (type: ProviderType, options: HandleLoginOptions = { callbackUrl }) => {
    if (type === 'github') {
      signIn('github', options);
    } else if (type === 'google') {
      signIn('google', options);
    } else if (type === 'twitter') {
      signIn('twitter', options);
    } else if (type === 'facebook') {
      signIn('facebook', options);
    } else if (type === 'apple') {
      signIn('apple', options);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-zinc-950 px-4 text-white">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }} className="relative z-10 w-full max-w-sm">
        <Card className="border border-zinc-700 bg-zinc-900 text-center shadow-xl">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-white">Giriş Yap</CardTitle>
            <CardDescription className="text-zinc-400">GitHub hesabınızla devam edin</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sessionNeedsRefresh && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left text-xs leading-5 text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <span>Önceki oturum çerezi doğrulanamadığı için temizlendi. GitHub ile yeniden giriş yaptığınızda güvenli oturum yeniden oluşturulacak.</span>
              </div>
            )}

            <Button onClick={() => handleLogin('github')} variant="secondary" className="flex w-full items-center justify-center gap-2 bg-white text-black transition hover:bg-zinc-200">
              <IconBrandGithub className="h-5 w-5" />
              GitHub ile Giriş Yap
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
