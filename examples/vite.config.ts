import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const at = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// The example runs against the workspace source, so it never shows a stale build.
export default defineConfig({
  resolve: {
    alias: {
      '@chatlychat/world': at('../src/index.ts'),
      '@chatlychat/core': at('../../core/src/index.ts'),
    },
  },
});
