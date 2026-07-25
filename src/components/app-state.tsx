'use client';

import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Database, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AppStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export function EmptyState({ icon: Icon = Database, title, description, actionLabel, onAction, compact = false }: AppStateProps) {
  return (
    <div className={`flex h-full w-full items-center justify-center ${compact ? 'px-3 py-5' : 'px-6 py-10'}`}>
      <div className={`flex max-w-md flex-col items-center text-center ${compact ? 'gap-2' : 'gap-3'}`}>
        <div className={`flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] ${compact ? 'h-9 w-9' : 'h-12 w-12'}`}>
          <Icon className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-emerald-400`} />
        </div>
        <div>
          <h3 className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-foreground`}>{title}</h3>
          {description && <p className={`mt-1 text-muted-foreground ${compact ? 'text-[11px] leading-4' : 'text-xs leading-5'}`}>{description}</p>}
        </div>
        {actionLabel && onAction && (
          <Button type="button" size="sm" className={`${compact ? 'h-7 text-[11px]' : 'h-8 text-xs'}`} onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export function ErrorState({ title, description, actionLabel, onAction, compact = false }: AppStateProps) {
  return (
    <div className={`flex h-full w-full items-center justify-center ${compact ? 'px-3 py-5' : 'px-6 py-10'}`}>
      <div className="flex max-w-md flex-col items-center gap-2 text-center">
        <div className={`flex items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 ${compact ? 'h-9 w-9' : 'h-12 w-12'}`}>
          <AlertTriangle className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-red-400`} />
        </div>
        <div>
          <h3 className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-foreground`}>{title}</h3>
          {description && <p className={`mt-1 text-red-300/80 ${compact ? 'text-[11px] leading-4' : 'text-xs leading-5'}`}>{description}</p>}
        </div>
        {actionLabel && onAction && (
          <Button type="button" variant="outline" size="sm" className={`${compact ? 'h-7 text-[11px]' : 'h-8 text-xs'}`} onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export function LoadingState({ title = 'Yükleniyor', description, compact = false }: { title?: string; description?: string; compact?: boolean }) {
  return (
    <div className={`flex h-full w-full items-center justify-center ${compact ? 'px-3 py-5' : 'px-6 py-10'}`}>
      <div className="flex flex-col items-center gap-2 text-center">
        <Loader2 className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} animate-spin text-emerald-400`} />
        <div>
          <p className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-foreground`}>{title}</p>
          {description && <p className={`mt-1 text-muted-foreground ${compact ? 'text-[11px]' : 'text-xs'}`}>{description}</p>}
        </div>
      </div>
    </div>
  );
}

export function SettingsPageSkeleton() {
  return (
    <div className="flex-1 overflow-hidden bg-background">
      <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
        <div className="space-y-2">
          <div className="h-7 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted/70" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="h-64 animate-pulse rounded-2xl border bg-muted/30" />
          <div className="h-64 animate-pulse rounded-2xl border bg-muted/30" />
        </div>
        <div className="h-44 animate-pulse rounded-2xl border bg-muted/30" />
      </div>
    </div>
  );
}
