import { defineConfig } from 'vite';
export default defineConfig({
  root: 'webview',
  base: './',
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'app.js', assetFileNames: 'app.[ext]' } },
  },
});
