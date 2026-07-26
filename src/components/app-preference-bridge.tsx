'use client';

import React from 'react';
import { useAppPreferences } from '@/lib/appPreferences';

export function AppPreferenceBridge() {
  useAppPreferences();
  return (
    <>
      <style>{`
        html, body, button, input, textarea, select { font-synthesis: none; text-rendering: geometricPrecision; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        table, th, td, .coreor-sql-editor, .coreor-sql-syntax, .coreor-console-text { text-shadow: none !important; -webkit-text-stroke: 0 transparent !important; font-kerning: normal; }
        table th, table td { line-height: 1.35 !important; vertical-align: middle; }
        .coreor-sql-editor, .coreor-sql-editor textarea, .coreor-sql-syntax, .coreor-sql-syntax pre {
          font-family: "Cascadia Code", "Fira Code", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
          font-size: var(--coreor-editor-font-size) !important;
          line-height: var(--coreor-line-height) !important;
          letter-spacing: 0 !important;
          font-variant-ligatures: contextual;
          tab-size: 2;
        }
        .coreor-sql-editor textarea { color: transparent !important; caret-color: var(--coreor-editor-fg) !important; }
        .coreor-sql-editor textarea::selection { color: transparent !important; background: var(--coreor-editor-selection) !important; }
      `}</style>
      <svg aria-hidden="true" className="pointer-events-none fixed h-0 w-0 overflow-hidden">
        <filter id="coreor-protanopia"><feColorMatrix values="0.567 0.433 0 0 0 0.558 0.442 0 0 0 0 0.242 0.758 0 0 0 0 0 1 0" /></filter>
        <filter id="coreor-deuteranopia"><feColorMatrix values="0.625 0.375 0 0 0 0.7 0.3 0 0 0 0 0.3 0.7 0 0 0 0 0 1 0" /></filter>
        <filter id="coreor-tritanopia"><feColorMatrix values="0.95 0.05 0 0 0 0 0.433 0.567 0 0 0 0.475 0.525 0 0 0 0 0 1 0" /></filter>
      </svg>
    </>
  );
}
