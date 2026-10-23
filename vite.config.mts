import { defineConfig } from 'vite';
export default defineConfig({
  root: 'webview',
  base: './',
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'app.js',
        assetFileNames: (asset) =>
          asset.names.some((name) => name.endsWith('.css')) ? 'app.css' : '[name]-[hash].[ext]',
      },
    },
  },
});
