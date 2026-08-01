# Theming

Single source of truth for design tokens. See CLAUDE.md §10.

## How it works

```
config/theme.ts   →   app/globals.css   →   Tailwind utilities / raw CSS
(typed tokens)        (CSS custom props)     (bg-primary, text-foreground, …)
```

1. **`config/theme.ts`** declares every token — colors (light + dark), fonts,
   spacing, radii, shadows — as a typed object. This is the canonical list.
2. **`app/globals.css`** mirrors those values as CSS custom properties in
   `:root` (light) and `.dark` (dark), e.g. `--primary`, `--font-heading`,
   `--shadow-md`.
3. The **`@theme inline`** block in `globals.css` exposes each CSS var to
   Tailwind v4, so utilities like `bg-primary`, `text-muted-foreground`,
   `font-heading`, `shadow-md` resolve to the token automatically. Raw CSS can
   also read `var(--primary)` directly — the two stay in sync because they read
   the same variable.

> **Tailwind v4 note.** v4 is CSS-first and has no `tailwind.config.ts`, and it
> cannot import a `.ts` file at build time. So `globals.css` is a _hand-mirrored_
> copy of `config/theme.ts`. When you change a token value, update both files.
> (Deferred idea: a small codegen script that writes the CSS block from
> `theme.ts` — noted for a later phase, not built now.)

## Change a value project-wide

To recolor the primary brand color across the entire app:

1. Edit `colors.primary` (and `colors.primaryForeground`) in `config/theme.ts`.
2. Update `--primary` / `--primary-foreground` in both the `:root` and `.dark`
   blocks of `app/globals.css` to match.

Every `bg-primary`, `text-primary`, `ring-primary`, etc. updates automatically.
No component change is ever required — components never hardcode a color, font,
or spacing value (CLAUDE.md §5, §10).

## Dark mode

Dark mode is **class-based**. `app/globals.css` declares
`@custom-variant dark (&:is(.dark *))`, and each token has a light value in
`:root` and a dark value in `.dark`. Toggling is a matter of adding/removing the
`dark` class on `<html>`.

- The mechanism is in place now; **no UI toggle ships in this phase**.
- `<html>` has `suppressHydrationWarning` so a future client-side theme script
  can set the class before hydration without a mismatch warning.

## Token groups

| Group   | Where        | Notes                                                                                                                                                                                       |
| ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colors  | `colors.*`   | Each token is `{ light, dark }`; oklch values. Includes background, foreground, primary, secondary, muted, accent, destructive, border, input, ring, card, popover (+ their `*Foreground`). |
| Fonts   | `fonts.*`    | `heading`, `body`, `mono`. Wired to the Geist fonts loaded in `app/layout.tsx`.                                                                                                             |
| Spacing | `spacing.*`  | rem scale mirroring Tailwind's default numeric steps.                                                                                                                                       |
| Radii   | `radii.base` | Base radius; `sm/md/lg/xl` derived in `globals.css`.                                                                                                                                        |
| Shadows | `shadows.*`  | `sm`, `md`, `lg`.                                                                                                                                                                           |

This fork ships the ApplyNinjaa violet palette (primary hue 300); both light and dark sets are chromatic violets rather than neutral gray. Values are chosen to stay inside the sRGB gamut — oklch lets you write colours that don't exist on screen, and browsers silently clip them, so check a new value before shipping it (`oklch(0.70 0.19 300)` and `oklch(0.95 0.03 300)` both clip; `0.70 0.17` and `0.94 0.03` do not).


## Brand assets

The palette above is code; the logo is a set of files. Next 15 picks the
`app/` ones up by **file convention** — no `metadata.icons` entry, no
`<link>` tag, no code of any kind. Drop the file in and it works.

| Path | Size | Purpose |
| --- | --- | --- |
| `app/icon.png` | 512×512 | favicon / tab icon |
| `app/apple-icon.png` | 180×180 | iOS home screen |
| `app/opengraph-image.png` | 1200×630 | link previews (`twitter.card` is already `summary_large_image`) |
| `public/logo-full.png` | ~1200 wide | wordmark lockup, if a text logo is wanted beside the mark |
| `extension/icons/icon-{16,32,48,128}.png` | as named | Chrome toolbar — see `extension/icons/README.md` |

Two things to know before adding them:

1. **Delete `app/favicon.ico` when `app/icon.png` lands.** `favicon.ico` takes
   precedence in Next's convention order, so leaving both means the new icon
   silently never appears.
2. `components/shared/BrandMark.tsx` still draws the shuriken as inline SVG.
   Swapping it for `next/image` pointed at the real mark updates `SiteHeader`,
   `AppHeader` and `SiteFooter` in one edit — it is deliberately the only
   place the mark is drawn.

Email templates (`lib/email/templates.ts`) and the extension's injected toast
(`extension/src/background.ts`) cannot read CSS variables, so each carries a
hardcoded hex mirroring `--primary`. Update those two by hand when the
primary changes; there is no way around it.
