import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Published on GitHub Pages at https://pedrokohler.github.io/latim-editor/
export default defineConfig({
  base: '/latim-editor/',
  plugins: [react()],
  // TipTap + ProseMirror + React are ~0.7 MB minified (0.23 MB gzipped); mammoth and docx load only when used
  build: { chunkSizeWarningLimit: 800 },
  server: { port: 4185 },
  preview: { port: 4186 },
});
