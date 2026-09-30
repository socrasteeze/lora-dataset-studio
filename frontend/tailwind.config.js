/** @type {import('tailwindcss').Config} */
// The explicit `.js`: node's own ESM resolver (the plugin contract test imports
// this file to read `content`) refuses a bare subpath; Vite and Tailwind accept both.
import defaultTheme from 'tailwindcss/defaultTheme.js'
import { resolvePluginBuildMode } from './scripts/privatePluginBuild.mjs'

// ── Safelight accent ramp ────────────────────────────────────────────────────
// The app's single accent: the amber of a darkroom safelight. It REPLACES the
// stock indigo scale below, so the hundreds of existing `*-indigo-*` utilities
// resolve to this ramp without touching their call sites. A follow-up codemod
// can rename indigo→accent; until then, "indigo" in a class name MEANS this
// amber. Contrast notes: 300+ read on dark surfaces; 500/600 are button fills
// and take dark text (`text-gray-950`), never white.
const safelight = {
  50: '#FBF3E7',
  100: '#F6E6CE',
  200: '#EFD0A0',
  300: '#E9B366',
  400: '#E59A3C',
  500: '#E1861F',
  600: '#C06E10',
  700: '#9C580D',
  800: '#78440B',
  900: '#573208',
  950: '#382004',
}

const baseConfig = {
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Archivo', ...defaultTheme.fontFamily.sans],
        mono: ['"IBM Plex Mono"', ...defaultTheme.fontFamily.mono],
      },
      // The type scale: 2xs 11 · xs 12 · sm 14 · base 16 · xl 20 · 2xl 24.
      // `2xs` replaces the old 10 px and 11 px one-offs (text-[10px],
      // text-[0.625rem], text-[11px], text-[0.6875rem]) — two spellings of two
      // near-identical sizes had grown into ~1,100 uses — for eyebrows, badges,
      // tile chips and micro-labels. Explicit line height, so it stops
      // inheriting 1.5 and producing 16.5 px lines.
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      colors: {
        primary: {
          DEFAULT: safelight[500],
          dark: safelight[600],
        },
        indigo: safelight,
        // ── Semantic theme tokens (backed by CSS vars in index.css) ──────────
        // App is dark-only. The *-alpha-baked tokens (surface, surface-raised,
        // border, border-strong) carry CSS-var-controlled default opacity.
        // Use the *-solid variants when you need to set your own alpha via
        // Tailwind's /NN modifier.
        app: 'rgb(var(--bg-app) / <alpha-value>)',
        surface: 'rgb(var(--surface) / var(--surface-alpha))',
        'surface-raised': 'rgb(var(--surface-raised) / var(--surface-raised-alpha))',
        'surface-overlay': 'rgb(var(--surface-overlay) / <alpha-value>)',
        'surface-solid': 'rgb(var(--surface-overlay) / <alpha-value>)',
        content: 'rgb(var(--content) / <alpha-value>)',
        'content-muted': 'rgb(var(--content-muted) / <alpha-value>)',
        'content-subtle': 'rgb(var(--content-subtle) / <alpha-value>)',
        border: 'rgb(var(--border) / var(--border-alpha))',
        'border-strong': 'rgb(var(--border-strong) / var(--border-strong-alpha))',
      },
      backgroundImage: {
        // Kept as a (near-flat) gradient so all existing `bg-gradient-primary`
        // call sites keep working — the tight amber ramp gives buttons a hint
        // of depth without reading as a two-hue gradient.
        'gradient-primary': `linear-gradient(135deg, ${safelight[500]} 0%, ${safelight[600]} 100%)`,
      },
    },
  },
  plugins: [],
}

export function createTailwindConfig(distribution = resolvePluginBuildMode()) {
  // Vite passes its resolved mode, including custom .env modes. A standalone
  // Tailwind invocation also defaults to Store; bundled development is explicit.
  return {
    ...baseConfig,
    content: ['./index.html', './src/**/*.{js,jsx}',
      ...(['bundled', 'fork'].includes(distribution) ? ['../bundled/*/frontend/**/*.{js,jsx}'] : [])],
  }
}

export default createTailwindConfig()
