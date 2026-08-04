import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const page = (name: string): string => fileURLToPath(new URL(`./${name}`, import.meta.url));

// This repo is worked almost entirely from git worktrees, whose node_modules is
// a symlink back to the main checkout. Vite resolves that link before checking
// its serving allow list, so the webfont 403s and the interface silently falls
// back to a system mono. Allow the directory the link actually points at.
const linkedModules = (): string[] => {
  try {
    return [realpathSync(page('node_modules'))];
  } catch {
    return [];
  }
};

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  server: { fs: { allow: ['.', ...linkedModules()] } },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Two pages, no shared entry: rooms.html is the standalone environment
    // viewer and imports nothing the game owns (docs/ENVIRONMENTS.md).
    rollupOptions: { input: { main: page('index.html'), rooms: page('rooms.html') } },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
