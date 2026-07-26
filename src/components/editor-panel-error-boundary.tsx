'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EditorPanelErrorBoundaryProps {
  children: React.ReactNode;
  resetKey: string;
}

interface EditorPanelErrorBoundaryState {
  error: Error | null;
}

export class EditorPanelErrorBoundary extends React.Component<EditorPanelErrorBoundaryProps, EditorPanelErrorBoundaryState> {
  state: EditorPanelErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): EditorPanelErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Coreor Database] Editor panel render failed', error, info.componentStack);
  }

  componentDidUpdate(previousProps: EditorPanelErrorBoundaryProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-background p-6">
        <div className="w-full max-w-xl rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-6 text-center shadow-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10"><AlertTriangle className="h-5 w-5 text-red-300" /></div>
          <h2 className="mt-4 text-sm font-semibold">Bu görünüm oluşturulamadı</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Yalnızca aktif içerik paneli durduruldu. Sidebar veya üst menüden başka bir görünüm açabilirsiniz.</p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg border bg-black/30 p-3 text-left font-mono text-[10px] leading-5 text-red-200">{this.state.error.message}</pre>
          <Button variant="outline" size="sm" className="mt-4 h-8 text-[10px]" onClick={() => this.setState({ error: null })}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Görünümü yeniden dene</Button>
        </div>
      </div>
    );
  }
}
