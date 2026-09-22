'use client';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { updateActivity } from './updateActivity';

// Busy leases survive unmount: async work releases them in its existing finally.
export function useTrackedBusy() {
  const [busy, setBusy] = useState(false);
  const release = useRef<null | (() => void)>(null);
  const set = useCallback((value: boolean) => {
    if (value && !release.current) release.current = updateActivity.begin();
    if (!value) { release.current?.(); release.current = null; }
    setBusy(value);
  }, []);
  return [busy, set] as const;
}
export function useUpdateBlocker(blocked: boolean) {
  useLayoutEffect(() => blocked ? updateActivity.block() : undefined, [blocked]);
}
