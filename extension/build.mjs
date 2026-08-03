/**
 * Product-aware build entry for the extension.
 *
 * Usage: PRODUCT=applyninja node build.mjs
 *        PRODUCT=scrapperninja node build.mjs
 *
 * Steps: type-check, then the main Vite build (popup + service worker + emitted
 * manifest). ScrapperNinja gets a SECOND Vite pass for its IIFE content script
 * (see vite.content.config.ts) because MV3 content scripts cannot be ES modules
 * and rollup cannot mix output formats in one build.
 */

import { spawnSync } from "node:child_process";

const PRODUCTS = ["applyninja", "scrapperninja"];
const product = process.env.PRODUCT;

if (!product || !PRODUCTS.includes(product)) {
  console.error(
    `PRODUCT must be ${PRODUCTS.join("|")} (got ${
      product ? `"${product}"` : "undefined"
    })`,
  );
  process.exit(1);
}

/** Run a command, inheriting stdio; exit the whole build on any failure. */
function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

// 1. Type-check (no emit).
run(npx, ["tsc", "--noEmit"]);

// 2. Main build: popup + service worker + manifest.
run(npx, ["vite", "build"]);

// 3. ScrapperNinja only: the IIFE content-script pass into the same dist dir.
if (product === "scrapperninja") {
  run(npx, ["vite", "build", "--config", "vite.content.config.ts"]);
}

console.log(`\nBuilt extension for ${product} -> dist/${product}/`);
