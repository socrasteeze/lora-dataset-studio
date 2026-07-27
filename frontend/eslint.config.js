// Minimal, deliberate lint surface: `no-undef` ONLY.
//
// WHY THIS EXISTS (fork history, not style policing)
// --------------------------------------------------
// Three upstream syncs in a row left a bare identifier behind in a hunk that
// merged with ZERO conflict markers — `isKlein` (2026-07-22), `gptViaSub`
// (2026-07-26), `storage` (2026-07-27, crashed the workspace on every dataset
// open/create). `npm run build` cannot catch these: bundlers resolve imports,
// not bare identifiers, and a ReferenceError only fires when the component
// mounts. `no-undef` catches all three at lint time.
//
// Keep this config narrow. It is a merge-leftover tripwire, not a style guide —
// adding stylistic rules would bury the one error that matters under noise and
// invite `--no-verify` habits. If a rule is added, it must catch a class of
// real bug this repo has actually shipped.
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['src/**/*.{js,jsx}', 'tests/**/*.mjs'],
    // Registered so the existing inline `eslint-disable react-hooks/…`
    // comments resolve; its rules stay OFF (see the header note).
    plugins: { 'react-hooks': reactHooks },
    // Some inline disables target rules this config doesn't enable — that is
    // expected (they document intent for humans), not a problem to report.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      // Browser + node: src runs in the browser, the colocated *.test.js files
      // and tests/*.mjs run under `node --test`.
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-undef': 'error',
    },
  },
];
