'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Github } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { HandleLoginOptions, ProviderType } from 'types';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

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
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-zinc-950 text-white">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className="relative z-10">
        <Card className="bg-zinc-900 border border-zinc-700 text-center max-w-sm mx-auto shadow-xl">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-white">Giriş Yap</CardTitle>
            <CardDescription className="text-zinc-400">GitHub hesabınızla devam edin</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => handleLogin('github')} variant="secondary" className="w-full flex items-center justify-center gap-2 bg-white text-black hover:bg-zinc-200 transition">
              <Github className="w-5 h-5" />
              GitHub ile Giriş Yap
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
