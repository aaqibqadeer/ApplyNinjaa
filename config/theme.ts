/**
 * config/theme.ts — single source of truth for design tokens (CLAUDE.md §10).
 *
 * Every color, font, spacing step, radius, and shadow the app uses is declared
 * here as a typed object. These values are mirrored into `app/globals.css` as
 * CSS custom properties (`--background`, `--primary`, `--font-heading`, ...),
 * and Tailwind v4 exposes them as utilities via the `@theme inline` block in
 * that same file. No component ever hardcodes a color/font/spacing value — if a
 * value is missing, add it here first, then wire the CSS var, then use it.
 *
 * Tailwind v4 note: v4 has no `tailwind.config.ts` and cannot import this TS
 * file at build time, so `globals.css` is the hand-mirrored runtime copy of
 * these tokens. Keep the two in sync — see `docs/architecture/theming.md`.
 * This fork (ApplyNinjaa) uses a navy/blue professional palette.
 *
 * Colors are stored as raw CSS color strings (oklch) so light/dark are just two
 * value sets for the same token name; the `.dark` class swaps them.
 */

export interface ColorToken {
  light: string;
  dark: string;
}

export interface ThemeColors {
  background: ColorToken;
  foreground: ColorToken;
  primary: ColorToken;
  primaryForeground: ColorToken;
  secondary: ColorToken;
  secondaryForeground: ColorToken;
  muted: ColorToken;
  mutedForeground: ColorToken;
  destructive: ColorToken;
  destructiveForeground: ColorToken;
  border: ColorToken;
  input: ColorToken;
  ring: ColorToken;
  card: ColorToken;
  cardForeground: ColorToken;
  popover: ColorToken;
  popoverForeground: ColorToken;
  accent: ColorToken;
  accentForeground: ColorToken;
}

export interface ThemeFonts {
  heading: string;
  body: string;
  mono: string;
}

export interface Theme {
  colors: ThemeColors;
  fonts: ThemeFonts;
  /** Spacing scale in rem. Keys map to Tailwind's default numeric scale. */
  spacing: Record<string, string>;
  /** Border radii, derived from a single base `--radius`. */
  radii: Record<string, string>;
  /** Box-shadow presets. */
  shadows: Record<string, string>;
}

export const theme: Theme = {
  colors: {
    background: { light: "oklch(0.99 0.003 250)", dark: "oklch(0.17 0.02 260)" },
    foreground: { light: "oklch(0.21 0.03 260)", dark: "oklch(0.96 0.008 250)" },
    primary: { light: "oklch(0.49 0.15 255)", dark: "oklch(0.68 0.13 252)" },
    primaryForeground: {
      light: "oklch(0.99 0.003 250)",
      dark: "oklch(0.17 0.03 260)",
    },
    secondary: { light: "oklch(0.955 0.01 250)", dark: "oklch(0.28 0.025 260)" },
    secondaryForeground: {
      light: "oklch(0.3 0.05 260)",
      dark: "oklch(0.96 0.008 250)",
    },
    muted: { light: "oklch(0.955 0.01 250)", dark: "oklch(0.28 0.025 260)" },
    mutedForeground: {
      light: "oklch(0.5 0.025 258)",
      dark: "oklch(0.71 0.02 255)",
    },
    destructive: {
      light: "oklch(0.577 0.245 27.325)",
      dark: "oklch(0.704 0.191 22.216)",
    },
    destructiveForeground: {
      light: "oklch(0.985 0 0)",
      dark: "oklch(0.985 0 0)",
    },
    border: { light: "oklch(0.91 0.015 252)", dark: "oklch(1 0 0 / 12%)" },
    input: { light: "oklch(0.91 0.015 252)", dark: "oklch(1 0 0 / 16%)" },
    ring: { light: "oklch(0.49 0.15 255)", dark: "oklch(0.68 0.13 252)" },
    card: { light: "oklch(1 0 0)", dark: "oklch(0.21 0.025 260)" },
    cardForeground: {
      light: "oklch(0.21 0.03 260)",
      dark: "oklch(0.96 0.008 250)",
    },
    popover: { light: "oklch(1 0 0)", dark: "oklch(0.21 0.025 260)" },
    popoverForeground: {
      light: "oklch(0.21 0.03 260)",
      dark: "oklch(0.96 0.008 250)",
    },
    accent: { light: "oklch(0.93 0.03 252)", dark: "oklch(0.32 0.045 258)" },
    accentForeground: {
      light: "oklch(0.3 0.06 258)",
      dark: "oklch(0.96 0.008 250)",
    },
  },
  fonts: {
    // Wired to the Geist fonts loaded in app/layout.tsx; swap per-fork.
    heading: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
    body: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
    mono: "var(--font-geist-mono), ui-monospace, monospace",
  },
  spacing: {
    "0": "0rem",
    px: "1px",
    "1": "0.25rem",
    "2": "0.5rem",
    "3": "0.75rem",
    "4": "1rem",
    "6": "1.5rem",
    "8": "2rem",
    "12": "3rem",
    "16": "4rem",
  },
  radii: {
    // Base radius; sm/md/lg/xl are derived from it in globals.css.
    base: "0.625rem",
  },
  shadows: {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  },
};
