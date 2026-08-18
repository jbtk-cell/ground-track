import { execSync } from 'node:child_process';
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

/**
 * A build stamp, printed on the page.
 *
 * Four separate times a defect was reported, fixed, and reported again, and the
 * player's own guess was eventually "maybe I'm not looking at the right version
 * of the game". That was a reasonable thing to suspect and there was no way to
 * check it: three servers were running on this machine, one of them serving a
 * different project entirely, and `vite preview` serves a static dist that only
 * changes when somebody runs a build. Nothing on screen said which was which.
 *
 * Now it does. If the stamp on the page does not match `git log -1`, you are
 * looking at an old build and no amount of fixing will show up.
 */
const buildStamp = (): string => {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
    return `${sha}${dirty ? '+' : ''}`;
  } catch {
    return 'unknown';
  }
};

export default defineConfig({
  define: { __BUILD_STAMP__: JSON.stringify(buildStamp()) },
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
