'use client';

import { useEffect } from 'react';
import { loadNativePlatformInfo } from '@/lib/platformRuntime';

type BigIntJsonPrototype = { toJSON?: () => string };

export function RuntimeCompatibility() {
  useEffect(() => {
    void loadNativePlatformInfo();
    const prototype = BigInt.prototype as unknown as BigIntJsonPrototype;
    if (!prototype.toJSON) {
      Object.defineProperty(prototype, 'toJSON', {
        configurable: true,
        value(this: bigint) {
          return this.toString();
        }
      });
    }
  }, []);

  return null;
}
