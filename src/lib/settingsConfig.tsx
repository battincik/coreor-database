import React from 'react';
import {
  Accessibility,
  AppWindow,
  Bell,
  BookOpen,
  Boxes,
  CreditCard,
  Database,
  Globe2,
  HardDrive,
  Keyboard,
  Languages,
  Link,
  Mail,
  Monitor,
  Package,
  Settings2,
  ShieldCheck,
  Sparkles,
  User,
  Users
} from 'lucide-react';

export const settingsItems = [
  { category: 'userSettings', items: ['account', 'profiles', 'dataPrivacy', 'authorizedApps', 'devices', 'connections'] },
  { category: 'billingSettings', items: ['subscriptions', 'billing'] },
  { category: 'appSettings', items: ['appearance', 'accessibility', 'notifications', 'keybinds', 'language', 'advanced'] },
  { category: 'other', items: ['whatsNew', 'products', 'support'] }
];

export const iconMap: Record<string, React.ReactNode> = {
  account: <User className="h-4 w-4" />,
  profiles: <Users className="h-4 w-4" />,
  dataPrivacy: <ShieldCheck className="h-4 w-4" />,
  authorizedApps: <AppWindow className="h-4 w-4" />,
  devices: <HardDrive className="h-4 w-4" />,
  connections: <Link className="h-4 w-4" />,
  subscriptions: <CreditCard className="h-4 w-4" />,
  billing: <CreditCard className="h-4 w-4" />,
  appearance: <Monitor className="h-4 w-4" />,
  accessibility: <Accessibility className="h-4 w-4" />,
  notifications: <Bell className="h-4 w-4" />,
  keybinds: <Keyboard className="h-4 w-4" />,
  language: <Languages className="h-4 w-4" />,
  advanced: <Settings2 className="h-4 w-4" />,
  whatsNew: <Sparkles className="h-4 w-4" />,
  products: <Boxes className="h-4 w-4" />,
  support: <Mail className="h-4 w-4" />,
  database: <Database className="h-4 w-4" />,
  documentation: <BookOpen className="h-4 w-4" />,
  region: <Globe2 className="h-4 w-4" />,
  package: <Package className="h-4 w-4" />
};

export const routeMap: Record<string, string> = {
  account: '/editor/settings',
  profiles: '/editor/settings/profiles',
  dataPrivacy: '/editor/settings/data-privacy',
  authorizedApps: '/editor/settings/authorized-apps',
  devices: '/editor/settings/devices',
  connections: '/editor/settings/connections',
  subscriptions: '/editor/billing/subscriptions',
  billing: '/editor/billing',
  appearance: '/editor/settings/appearance',
  accessibility: '/editor/settings/accessibility',
  notifications: '/editor/settings/notifications',
  keybinds: '/editor/settings/keybinds',
  language: '/editor/settings/language',
  advanced: '/editor/settings/advanced',
  whatsNew: '/editor/other/whats-new',
  products: '/editor/other/products',
  support: '/editor/other/support'
};
