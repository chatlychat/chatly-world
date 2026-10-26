import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const vitestExecution = { pool: 'threads' as const };

export default defineConfig({
  // The core is resolved from source so a spec never runs against a stale dist.
  resolve: {
    alias: {
      // Spec-only: `cards.parity.spec.ts` compares formatPrice with the owner. Never imported by src/.
      '@livechat/shared/widget-blocks': fileURLToPath(
        new URL('../shared/src/widget-blocks/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    ...vitestExecution,
    // NODE: three builds a scene graph with no GL context and no DOM.
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['**/node_modules/**'],
  },
});
