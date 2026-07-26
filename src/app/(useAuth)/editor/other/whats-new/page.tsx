import Link from 'next/link';
import { ArrowLeft, GitPullRequest } from 'lucide-react';
import { ReleaseNotesTree } from '@/components/release-notes-tree';

export default function WhatsNewPage() {
  return (
    <main className="min-h-screen overflow-y-auto bg-background text-foreground">
      <div className="sticky top-0 z-20 border-b border-border/80 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-12 max-w-7xl items-center gap-3 px-4">
          <Link href="/editor" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
          <GitPullRequest className="h-4 w-4 text-cyan-400" />
          <div><div className="text-xs font-semibold">Coreor Database sürüm ağacı</div><div className="text-[9px] text-muted-foreground">Bütün pull requestler, sürümler ve kullanıcıya yansıyan değişiklikler</div></div>
          <span className="ml-auto rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-1 font-mono text-[9px] text-cyan-300">v2.0.1</span>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <ReleaseNotesTree />
      </div>
    </main>
  );
}
