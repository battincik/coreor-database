import React from 'react';
import {
  Accessibility,
  Database,
  Monitor,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  User
} from 'lucide-react';

export const settingsItems = [
  { category: 'databaseSettings', items: ['account', 'servers', 'appearance', 'accessibility', 'querySettings', 'security', 'advanced', 'whatsNew'] }
];

export const iconMap: Record<string, React.ReactNode> = {
  account: <User className="h-4 w-4" />,
  servers: <Server className="h-4 w-4" />,
  appearance: <Monitor className="h-4 w-4" />,
  accessibility: <Accessibility className="h-4 w-4" />,
  querySettings: <Terminal className="h-4 w-4" />,
  security: <ShieldCheck className="h-4 w-4" />,
  advanced: <Settings2 className="h-4 w-4" />,
  whatsNew: <Sparkles className="h-4 w-4" />,
  database: <Database className="h-4 w-4" />
};

export const routeMap: Record<string, string> = {
  account: '/editor/settings',
  servers: '/editor/settings/servers',
  appearance: '/editor/settings/appearance',
  accessibility: '/editor/settings/accessibility',
  querySettings: '/editor/settings/query',
  security: '/editor/settings/security',
  advanced: '/editor/settings/advanced',
  whatsNew: '/editor/settings/whats-new'
};
