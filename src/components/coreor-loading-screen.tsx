import { Database } from 'lucide-react';

export function CoreorLoadingScreen({ title = 'Coreor Database hazırlanıyor', description = 'Çalışma alanı, şifreli kasa ve oturum bilgileri yükleniyor.' }: { title?: string; description?: string }) {
  return (
    <div className="relative flex h-screen min-h-[420px] items-center justify-center overflow-hidden bg-background px-6 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,.09),transparent_36%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(113,113,122,.09)_1px,transparent_1px),linear-gradient(90deg,rgba(113,113,122,.09)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="relative w-full max-w-md rounded-3xl border border-border/80 bg-card/75 p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-2xl bg-cyan-500/10 [animation-duration:2.2s]" />
          <span className="absolute inset-1 animate-pulse rounded-2xl border border-cyan-500/25 bg-cyan-500/[0.06]" />
          <Database className="relative h-7 w-7 text-cyan-400" />
        </div>
        <h1 className="mt-6 text-base font-semibold tracking-tight">{title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted-foreground">{description}</p>
        <div className="mx-auto mt-6 h-1 w-52 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-[coreor-loading_1.25s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-purple-500" />
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Coreor.net
        </div>
      </div>
      <style>{`@keyframes coreor-loading { 0% { transform: translateX(-115%); } 50% { transform: translateX(115%); } 100% { transform: translateX(315%); } }`}</style>
    </div>
  );
}
