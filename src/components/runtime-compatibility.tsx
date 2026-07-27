'use client';

import { useEffect } from 'react';

type BigIntWithJson = BigInt & { toJSON?: () => string };

export function RuntimeCompatibility() {
  useEffect(() => {
    const prototype = BigInt.prototype as BigIntWithJson;
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
