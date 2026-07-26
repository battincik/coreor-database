'use client';

import { useEffect } from 'react';
import EditorInterface from '@/components/editor-interface';
import {
  OPEN_SETTINGS_MODAL_EVENT,
  dispatchDatabaseTool,
  type OpenSettingsModalDetail
} from '@/lib/databaseToolEvents';

export function SettingsRouteLauncher({ tab = 'account' }: { tab?: NonNullable<OpenSettingsModalDetail['tab']> }) {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => dispatchDatabaseTool(OPEN_SETTINGS_MODAL_EVENT, { tab }));
    return () => window.cancelAnimationFrame(frame);
  }, [tab]);

  return <EditorInterface />;
}
