import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

export default defineConfig({
  base: '/ExoWeb/',
  plugins: [
    {
      name: 'ship-license-notices',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'THIRD_PARTY_NOTICES.md',
          source: readFileSync(new URL('./THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8'),
        });
      },
    },
  ],
  build: { target: 'es2023', chunkSizeWarningLimit: 1100 },
  server: { port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
