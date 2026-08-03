/**
 * Vite build for the MV3 extensions — parameterised by product.
 *
 * This one config builds TWO independent extensions from a shared codebase:
 *
 *   PRODUCT=applyninja      -> dist/applyninja/
 *   PRODUCT=scrapperninja   -> dist/scrapperninja/
 *
 * PRODUCT is read from the environment; an unknown or missing value fails the
 * build loudly, because a silent default would ship the wrong extension.
 *
 * Each product owns its own popup.html, service worker (src/background.ts) and
 * manifest.template.json under products/<product>/. Shared code (the API
 * client, response types, the token-based popup CSS) lives in extension/shared/
 * and is imported via relative paths.
 *
 * Backend origin: VITE_API_ORIGIN (defaults to http://localhost:3000). It lands
 * in both the manifest host_permissions and the API client via __API_ORIGIN__.
 *
 * MV3 content scripts CANNOT be ES modules, but this build emits the popup and
 * service worker as format "es" and rollup cannot mix formats in one pass. So
 * ScrapperNinja's content script is built by a SECOND pass — see
 * vite.content.config.ts.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const PRODUCTS = ["applyninja", "scrapperninja"] as const;
type Product = (typeof PRODUCTS)[number];

function resolveProduct(): Product {
  const value = process.env.PRODUCT;
  if (!value || !PRODUCTS.includes(value as Product)) {
    throw new Error(
      `PRODUCT must be one of ${PRODUCTS.join(" | ")} (got ${
        value ? `"${value}"` : "undefined"
      }). Build with e.g. PRODUCT=applyninja.`,
    );
  }
  return value as Product;
}

const PRODUCT = resolveProduct();
const PRODUCT_DIR = resolve(__dirname, "products", PRODUCT);

const API_ORIGIN = process.env.VITE_API_ORIGIN ?? "http://localhost:3000";

/** Toolbar icon sizes Chrome asks for, by convention. */
const ICON_SIZES = [16, 32, 48, 128] as const;

/**
 * Emit manifest.json from the product's manifest.template.json, substituting
 * the backend origin. Copies whichever icons actually exist (declaring a
 * missing icon makes Chrome refuse to load the extension). Icons are read from
 * products/<product>/icons/, falling back to the shared extension/icons/ set.
 */
function emitManifest(): Plugin {
  return {
    name: "emit-manifest",
    generateBundle() {
      const template = readFileSync(
        resolve(PRODUCT_DIR, "manifest.template.json"),
        "utf8",
      );
      const manifest = JSON.parse(
        template.replaceAll("__API_ORIGIN__", API_ORIGIN),
      ) as Record<string, unknown> & {
        action?: Record<string, unknown>;
      };

      const iconDirs = [
        resolve(PRODUCT_DIR, "icons"),
        resolve(__dirname, "icons"),
      ];
      const icons: Record<string, string> = {};
      for (const size of ICON_SIZES) {
        const source = iconDirs
          .map((dir) => resolve(dir, `icon-${size}.png`))
          .find((path) => existsSync(path));
        if (!source) continue;
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
  // Root is the product folder so popup.html lands at the dist root
  // (dist/<product>/popup.html), exactly where the manifest expects it.
  root: PRODUCT_DIR,
  plugins: [react(), tailwindcss(), emitManifest()],
  define: {
    __API_ORIGIN__: JSON.stringify(API_ORIGIN),
  },
  build: {
    outDir: resolve(__dirname, "dist", PRODUCT),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(PRODUCT_DIR, "popup.html"),
        background: resolve(PRODUCT_DIR, "src/background.ts"),
      },
      output: {
        format: "es",
        entryFileNames: "[name].js",
      },
    },
  },
});
