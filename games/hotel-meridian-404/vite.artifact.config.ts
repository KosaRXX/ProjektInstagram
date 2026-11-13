import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Wariant pod publikację jako pojedynczy plik: jeden chunk, bez podziału na moduły.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-artifact',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
