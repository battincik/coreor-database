'use client';

import { useEffect, useId, useLayoutEffect, useRef } from 'react';

const modalStack: string[] = [];

function removeFromStack(id: string) {
  const index = modalStack.lastIndexOf(id);
  if (index >= 0) modalStack.splice(index, 1);
}

export function useModalEscape(open: boolean, onClose: () => void, disabled = false) {
  const id = useId();
  const closeRef = useRef(onClose);

  useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    removeFromStack(id);
    modalStack.push(id);

    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || modalStack[modalStack.length - 1] !== id) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (!disabled) closeRef.current();
    };

    window.addEventListener('keydown', handler, true);
    return () => {
      window.removeEventListener('keydown', handler, true);
      removeFromStack(id);
    };
  }, [open, disabled, id]);
}
