# Extension icons

Drop the toolbar icons here as **`icon-16.png`**, **`icon-32.png`**,
**`icon-48.png`**, **`icon-128.png`** (square, transparent background).

Nothing else is needed — `vite.config.ts` copies whichever of these files
exist into `dist/icons/` and adds the matching `icons` + `action.default_icon`
keys to the generated `manifest.json`. Missing files are skipped rather than
declared, because a manifest pointing at an icon that isn't there makes
Chrome refuse to load the extension.

So: add the four PNGs, run `npm run build:extension`, done. No code change.

Chrome uses 16 in the toolbar, 32 on Windows, 48 in the extensions page, and
128 in the Web Store listing and installation dialog.
