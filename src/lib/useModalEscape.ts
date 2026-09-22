'use client';

import { useEffect, useRef } from 'react';

let modalSequence = 0;
const modalStack: string[] = [];

function removeFromStack(id: string) {
  const index = modalStack.lastIndexOf(id);
  if (index >= 0) modalStack.splice(index, 1);
}

export function useModalEscape(open: boolean, onClose: () => void, disabled = false) {
  const idRef = useRef('');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  if (!idRef.current) idRef.current = `coreor-modal-${++modalSequence}`;

  useEffect(() => {
    if (!open) return;
    const id = idRef.current;
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
  }, [open, disabled]);
}
