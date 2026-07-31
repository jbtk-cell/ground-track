import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'shots'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Build and tooling scripts run in Node, not the browser.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
        window: 'readonly',
      },
    },
  },
  {
    // The simulation core must stay engine-independent so it can be tested
    // headlessly and ported. See docs/LOOP.md, invariant 2.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['three', 'three/*', '../render/*', '../ui/*'] },
      ],
    },
  }
);
