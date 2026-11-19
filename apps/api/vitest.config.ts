import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC emits the decorator metadata Nest's dependency injection reads; esbuild does not.
export default defineConfig({
  test: { name: 'api' },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
