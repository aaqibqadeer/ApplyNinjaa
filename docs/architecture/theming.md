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

This fork ships the ApplyNinjaa navy/blue palette (professional, LinkedIn-adjacent); both light and dark sets are chromatic blues rather than neutral gray.
