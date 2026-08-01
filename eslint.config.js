import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// docs/DIRECTION.md: "No glow, at any intensity." Bloom is most of why this
// game does not read as sci-fi; the ban is a lint error, not a convention.
const noBloomMessage =
  'No bloom, lens flare, chromatic aberration, or emissive UI at any intensity (docs/DIRECTION.md) - post-processing passes are banned project-wide.';

const noBloomImports = {
  paths: [{ name: 'postprocessing', message: noBloomMessage }],
  patterns: [
    { group: ['three/examples/jsm/postprocessing/*'], message: noBloomMessage },
    { group: ['three/addons/postprocessing/*'], message: noBloomMessage },
    { group: ['**/*Bloom*'], message: noBloomMessage },
  ],
};

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'shots'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      // Thin-space digit grouping (U+2009) is this game's own dialect and shows
      // up in doc-comment examples; code must still spell it as the \u2009 escape.
      'no-irregular-whitespace': ['error', { skipComments: true }],
      'no-restricted-imports': ['error', noBloomImports],
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
    // headlessly and ported. See docs/LOOP.md, invariant 2. This block's
    // 'no-restricted-imports' fully replaces the project-wide one above for
    // files under src/sim, so the bloom ban is repeated here alongside it.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [...noBloomImports.paths],
          patterns: [
            { group: ['three', 'three/*', '../render/*', '../ui/*'] },
            ...noBloomImports.patterns,
          ],
        },
      ],
    },
  }
);
