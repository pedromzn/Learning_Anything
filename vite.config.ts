/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

/*
 * The web app. There is no separate Vite server: in `npm run dev` Express (`server/main.ts`) mounts Vite in middleware
 * mode, on the SAME port as the API; in `npm start` it serves `dist/`. One port, one process.
 */
export default defineConfig({
  root: path.resolve(__dirname, 'web'),
  publicDir: path.resolve(__dirname, 'web/public'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      '@': path.resolve(__dirname, 'web/src'),
    },
  },
  build: { outDir: path.resolve(__dirname, 'dist'), emptyOutDir: true },
  test: {
    environment: 'node',
    root: __dirname,
    setupFiles: ['test/setup.ts'],
    include: ['shared/**/*.test.ts', 'server/**/*.test.ts', 'scripts/**/*.test.ts', 'web/src/**/*.test.{ts,tsx}'],
  },
})
