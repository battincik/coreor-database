import React from 'react';
import { User, Settings, Package, Monitor, CreditCard, Star, Mail } from 'lucide-react';

export const settingsItems = [
  { category: 'userSettings', items: ['account', 'profiles', 'dataPrivacy', 'authorizedApps', 'devices', 'connections'] },
  { category: 'billingSettings', items: ['subscriptions', 'billing'] },
  { category: 'appSettings', items: ['appearance', 'accessibility', 'notifications', 'keybinds', 'language', 'advanced'] },
  { category: 'other', items: ['whatsNew', 'products', 'support'] }
];

export const iconMap: Record<string, React.ReactNode> = {
  account: <User className="h-4 w-4" />,
  profiles: <Settings className="h-4 w-4" />,
  dataPrivacy: <Package className="h-4 w-4" />,
  authorizedApps: <Settings className="h-4 w-4" />,
  devices: <Monitor className="h-4 w-4" />,
  connections: <Settings className="h-4 w-4" />,
  subscriptions: <CreditCard className="h-4 w-4" />,
  billing: <CreditCard className="h-4 w-4" />,
  appearance: <Monitor className="h-4 w-4" />,
  accessibility: <Settings className="h-4 w-4" />,
  notifications: <Settings className="h-4 w-4" />,
  keybinds: <Settings className="h-4 w-4" />,
  language: <Settings className="h-4 w-4" />,
  advanced: <Settings className="h-4 w-4" />,
  whatsNew: <Star className="h-4 w-4" />,
  products: <Package className="h-4 w-4" />,
  support: <Mail className="h-4 w-4" />
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
