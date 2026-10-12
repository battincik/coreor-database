'use client';

import { useEffect } from 'react';
import { NotificationHistoryPage } from '@/components/notification-history-page';

export default function NotificationsPage() {
  useEffect(() => {
    const returnToEditor = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[data-coreor-context-menu="true"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.replace('/editor/');
    };
    window.addEventListener('keydown', returnToEditor, true);
    return () => window.removeEventListener('keydown', returnToEditor, true);
  }, []);

  return <NotificationHistoryPage />;
}
