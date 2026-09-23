import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // Coreor is a Tauri/React application and does not compile with the
      // experimental React Compiler. These compiler-only diagnostics reject
      // intentional desktop state synchronization and event-time timestamps.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn'
    }
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'src-tauri/target/**',
    'next-env.d.ts'
  ])
]);
