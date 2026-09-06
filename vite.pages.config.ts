import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';

// The public static build shares the exact application and encrypted local store
// with Sites. It has no server component, API, account service or asset upload.
export default defineConfig({
  root: fileURLToPath(new URL('./static', import.meta.url)),
  base: '/wxjj/',
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  define: { 'process.env.NEXT_PUBLIC_BASE_PATH': JSON.stringify('/wxjj') },
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: '../dist/pages', emptyOutDir: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
