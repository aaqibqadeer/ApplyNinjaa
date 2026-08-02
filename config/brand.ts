/**
 * config/brand.ts — product identity strings, declared once.
 *
 * Re-exports from the active product registry (config/products.ts) so a
 * rebrand / product switch is an env change, not a hunt through call sites.
 * Visual tokens live in config/theme.ts.
 */

import { activeProduct } from "./products";

export const APP_NAME = activeProduct.name;

export const APP_DESCRIPTION = activeProduct.description;

export const APP_TAGLINE = activeProduct.tagline;

export const APP_SUPPORT_EMAIL = activeProduct.supportEmail;
