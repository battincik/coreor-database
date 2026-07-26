'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { Database, Github, Key, LogOut, Monitor, Shield, User } from 'lucide-react';
import { SettingsSidebar } from './components/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { readEncryptedServerProfiles } from '@/lib/secureVault';

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || 'K';
  return source.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
}

function shortenIdentifier(value?: string | null) {
  if (!value) return 'Kullanılamıyor';
  return value.length > 26 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}

export default function SettingsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { activeToken, isReady } = useAuth();
  const [vaultCount, setVaultCount] = useState<number | null>(null);
  const user = session?.user;
  const displayName = user?.name || 'Coreor kullanıcısı';
  const displayEmail = user?.email || 'E-posta bilgisi paylaşılmadı';

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!activeToken) { if (!cancelled) setVaultCount(0); return; }
      void readEncryptedServerProfiles(activeToken)
        .then(items => { if (!cancelled) setVaultCount(items.length); })
        .catch(() => { if (!cancelled) setVaultCount(0); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [activeToken]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SettingsSidebar activeTab="account" />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
          <div><div className="flex items-center gap-2 text-xs font-medium text-emerald-400"><User className="h-4 w-4" /> Hesap ve güvenlik</div><h1 className="mt-2 text-2xl font-semibold tracking-tight">Hesap ayarları</h1><p className="mt-1 text-sm text-muted-foreground">Oturum bilgilerinizi ve bu cihazdaki şifreli veritabanı kasasını yönetin.</p></div>
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <Card className="border-zinc-800 bg-card/70"><CardHeader className="pb-4"><CardTitle className="text-base">Profil</CardTitle><CardDescription>Bu bilgiler GitHub hesabınızdan güvenli oturum sırasında alınır.</CardDescription></CardHeader><CardContent className="space-y-5">
              <div className="flex items-center gap-4 rounded-xl border bg-background/30 p-4"><Avatar className="h-16 w-16"><AvatarImage src={user?.image || undefined} alt={displayName} /><AvatarFallback className="text-lg">{initials(displayName, displayEmail)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><div className="truncate text-lg font-semibold">{displayName}</div><div className="truncate text-sm text-muted-foreground">{displayEmail}</div><div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300"><Github className="h-3 w-3" /> GitHub ile bağlı</div></div></div>
              <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Oturum durumu</div><div className="mt-1 text-sm font-medium">{status === 'authenticated' ? 'Aktif' : status === 'loading' ? 'Doğrulanıyor' : 'Oturum kapalı'}</div></div><div className="rounded-xl border p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Hesap kimliği</div><div className="mt-1 truncate font-mono text-xs">{isReady ? shortenIdentifier(activeToken) : 'Hazırlanıyor…'}</div></div></div>
              <p className="text-xs leading-5 text-muted-foreground">Ad, e-posta veya profil fotoğrafı değişiklikleri GitHub üzerinden yapılır. Coreor bu alanların ayrı bir kopyasını sunucuda saklamaz.</p>
            </CardContent></Card>
            <Card className="border-zinc-800 bg-card/70"><CardHeader className="pb-4"><CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4 text-emerald-400" /> Şifreli kasa</CardTitle><CardDescription>Kasa sayımı ilk ekranı engellemeden arka planda yüklenir.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="rounded-xl border bg-background/30 p-4"><div className="text-3xl font-semibold tabular-nums">{vaultCount === null ? '…' : vaultCount}</div><div className="mt-1 text-xs text-muted-foreground">Şifreli sunucu profili</div></div><div className="space-y-3 text-xs"><div className="flex items-start gap-2"><Key className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" /><span>AES-256-GCM anahtarı tarayıcıdan dışarı çıkarılamaz.</span></div><div className="flex items-start gap-2"><Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-400" /><span>Kasa yalnızca bu cihaz ve tarayıcı profilinde kullanılabilir.</span></div><div className="flex items-start gap-2"><Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /><span>Parolalar uygulama sunucusunda kalıcı olarak tutulmaz.</span></div></div><Button type="button" variant="outline" className="h-9 w-full text-xs" onClick={() => router.push('/editor')}>Veritabanı editörüne dön</Button></CardContent></Card>
          </div>
          <Card className="border-red-500/20 bg-red-500/[0.04]"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base text-red-300"><LogOut className="h-4 w-4" /> Oturumu kapat</CardTitle><CardDescription>Çıkış yapmak şifreli kasayı silmez.</CardDescription></CardHeader><CardContent><Button type="button" variant="destructive" className="h-9 text-xs" onClick={() => signOut({ callbackUrl: '/' })}>Bu cihazdaki oturumu kapat</Button></CardContent></Card>
        </div>
      </main>
    </div>
  );
}
