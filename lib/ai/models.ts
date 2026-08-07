/**
 * lib/ai/models.ts — default model id per provider (Phase 8).
 *
 * Single source of truth so model ids never get hardcoded in app code or route
 * handlers (§8). A caller can still override per request via
 * `GenerateOptions.model`; this is only the fallback when they don't.
 *
 * Bump these as providers ship newer models — it's the one place to change.
 */

import type { AiProvider } from "@/config/features";

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-opus-4-8",
  openai: "gpt-4o",
  deepseek: "deepseek-chat",
};
