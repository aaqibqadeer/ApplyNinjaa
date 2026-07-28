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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const API_ORIGIN = process.env.VITE_API_ORIGIN ?? "http://localhost:3000";

function emitManifest(): Plugin {
  return {
    name: "emit-manifest",
    generateBundle() {
      const template = readFileSync(
        resolve(__dirname, "manifest.template.json"),
        "utf8",
      );
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: template.replaceAll("__API_ORIGIN__", API_ORIGIN),
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
