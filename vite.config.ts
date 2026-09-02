import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Dev läuft über die Vite-Middleware des Express-Servers (server.ts) —
      // HMR aus, damit der in-process Dev-Server den Browser nicht doppelt anstößt.
      hmr: false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 800,
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (
                id.includes('node_modules/react') ||
                id.includes('node_modules/react-dom') ||
                id.includes('node_modules/motion') ||
                id.includes('node_modules/framer-motion')
              ) {
                return 'vendor';
              }
              if (id.includes('node_modules/lucide-react')) {
                return 'ui';
              }
            }
            if (id.includes('src/components/KnowledgeGraph')) {
              return 'graph';
            }
          },
        },
      },
    },
    esbuild: {
      target: 'es2020',
    },
  };
});
