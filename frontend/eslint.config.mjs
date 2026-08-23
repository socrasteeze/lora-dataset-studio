// WHY THIS FORK CARES (kept from the fork's own eslint.config.js, retired
// 2026-08-22 when upstream shipped this gate and the two files would otherwise
// have coexisted — flat-config resolution prefers `.js`, so the fork's copy
// would have silently won and this one would have been dead).
//
// Three upstream syncs in a row left a bare identifier behind in a hunk that
// merged with ZERO conflict markers: `isKlein` (2026-07-22), `gptViaSub`
// (2026-07-26), `storage` (2026-07-27, which crashed the workspace on every
// dataset open/create). `npm run build` cannot catch these — bundlers resolve
// imports, not bare identifiers, and a ReferenceError only fires when the
// component mounts. `no-undef` below is that tripwire, and `react/jsx-no-undef`
// covers the JSX half of the same class. Do not relax either to make a sync
// pass; a leftover is the thing they exist to find.

// ESLint — the frontend's lint gate (`npm run lint` from frontend/).
//
// Scope on purpose: correctness and dead code, not style. What is enabled
// here is what cannot be intended — a variable that is assigned and never
// read, a reference to a name that does not exist, a hook called under a
// condition, an object literal writing the same key twice — plus the
// exhaustive-deps rule, kept as a WARNING because a stale closure is a bug
// only sometimes, and a fix there changes behaviour. Formatting and naming
// stay out: a clean `npm run build` plus `node --test` are the bar for
// behaviour, this file only catches what those two cannot see.
//
// CI runs exactly `npm run lint`; the versions are pinned in package.json.

import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, ...globals.es2021 },
    },
    plugins: { "react-hooks": reactHooks, react },
    settings: { react: { version: "19.0" } },
    linterOptions: {
      // A disable comment for a rule nobody enables is a stale note, not a
      // suppression: report it so it gets cleaned up rather than trusted.
      reportUnusedDisableDirectives: "warn",
    },
    rules: {
      // FORK: WARN, not error — upstream's level. This fork's D1/D4 removals
      // have left ~35 orphaned imports and bindings across BankWorkspace,
      // TrainingPanel, CloudRunsPage and VariationCatalog, every one of them
      // PRE-EXISTING (measured 2026-08-22: linting the pre-merge tree with this
      // very config reports the same 35, so none is merge damage). Clearing
      // them cascades — deleting the two dead full-model components in
      // TrainingPanel orphans four more symbols, the next of which is a 58-line
      // handler — and that excavation is its own wave, not a sync's business.
      // Gate 1 exists for the bare-identifier ReferenceError class, and the two
      // rules that catch it (no-undef, react/jsx-no-undef) stay at ERROR below.
      // Restore this to "error" when the orphan wave lands.
      "no-unused-vars": ["warn", {
        args: "after-used",
        ignoreRestSiblings: true,
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_",
        caughtErrors: "none",
      }],
      "no-undef": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-empty": "warn",
      "no-constant-condition": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "off",
      "react/jsx-no-undef": "error",
      "react/jsx-key": "warn",
    },
  },
];
