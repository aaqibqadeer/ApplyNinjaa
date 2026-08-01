/**
 * Vite build for the MV3 extension: two entries (React popup page + ES-module
 * service worker) and a tiny plugin that emits manifest.json from
 * manifest.template.json with the backend origin substituted.
 *
 * No content-script entry on purpose — all page-DOM work ships as serialized
 * functions via chrome.scripting.executeScript (src/lib/dom-actions.ts), so
 * nothing else needs bundling.
 *
 * Backend origin: VITE_API_ORIGIN (defaults to http://localhost:3000). It
 * lands in both the manifest host_permissions and the API client.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const API_ORIGIN = process.env.VITE_API_ORIGIN ?? "http://localhost:3000";

/** Toolbar icon sizes Chrome asks for, by convention. */
const ICON_SIZES = [16, 32, 48, 128] as const;

/**
 * Copy extension/icons/icon-<size>.png into the bundle and declare them in the
 * manifest — but ONLY the ones that actually exist. Declaring a missing icon
 * makes Chrome refuse to load the extension, so an absent icon set simply
 * yields a manifest without `icons`, exactly as before. Dropping the PNGs in
 * is therefore a pure file-add with no code change.
 */
function emitManifest(): Plugin {
  return {
    name: "emit-manifest",
    generateBundle() {
      const template = readFileSync(
        resolve(__dirname, "manifest.template.json"),
        "utf8",
      );
      const manifest = JSON.parse(
        template.replaceAll("__API_ORIGIN__", API_ORIGIN),
      ) as Record<string, unknown> & {
        action?: Record<string, unknown>;
      };

      const icons: Record<string, string> = {};
      for (const size of ICON_SIZES) {
        const source = resolve(__dirname, `icons/icon-${size}.png`);
        if (!existsSync(source)) continue;
        const fileName = `icons/icon-${size}.png`;
        this.emitFile({
          type: "asset",
          fileName,
          source: readFileSync(source),
        });
        icons[String(size)] = fileName;
      }
      if (Object.keys(icons).length > 0) {
        manifest.icons = icons;
        if (manifest.action) manifest.action.default_icon = icons;
      }

      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify(manifest, null, 2),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), emitManifest()],
  define: {
    __API_ORIGIN__: JSON.stringify(API_ORIGIN),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        background: resolve(__dirname, "src/background.ts"),
      },
      output: {
        format: "es",
        entryFileNames: "[name].js",
      },
    },
  },
});
