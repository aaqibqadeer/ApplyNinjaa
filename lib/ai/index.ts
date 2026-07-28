/**
 * lib/ai/index.ts — provider selector for the AI adapter (Phase 8).
 *
 * App code imports `ai` from here and never touches a provider SDK (§1.2). Unlike
 * the single-provider adapters (storage/phone/payments), `aiProviders` is an
 * ARRAY of concurrently-enabled providers, so this exposes a provider-keyed
 * accessor rather than one global singleton:
 *
 *   ai().generate({ prompt })            // default provider
 *   ai("openai").generate({ prompt })    // explicit provider
 *
 * Default provider = `AI_DEFAULT_PROVIDER` when set and enabled, otherwise the
 * first entry in `features.aiProviders`. Adapters are built lazily (the SDK
 * client is constructed on first use) and cached per provider.
 */

import { env } from "@/config/env.schema";
import { type AiProvider, features } from "@/config/features";

import type { AiAdapter } from "./adapter";
import { AnthropicAdapter } from "./anthropic/adapter";
import { DeepSeekAdapter } from "./deepseek/adapter";
import { OpenAiAdapter } from "./openai/adapter";

const factories: Record<AiProvider, () => AiAdapter> = {
  anthropic: () => new AnthropicAdapter(),
  openai: () => new OpenAiAdapter(),
  deepseek: () => new DeepSeekAdapter(),
};

const cache = new Map<AiProvider, AiAdapter>();

/** The provider used when a caller doesn't name one. */
export function defaultProvider(): AiProvider {
  const enabled = features.aiProviders;
  if (enabled.length === 0) {
    throw new Error(
      "AI is disabled — set NEXT_PUBLIC_FEATURE_AI_PROVIDERS (e.g. 'anthropic,openai')",
    );
  }
  const preferred = env.AI_DEFAULT_PROVIDER as AiProvider | undefined;
  if (preferred && enabled.includes(preferred)) return preferred;
  return enabled[0];
}

/**
 * Get the adapter for `provider` (or the default provider). Throws if AI is off
 * or the requested provider isn't in `features.aiProviders`.
 */
export function ai(provider?: AiProvider): AiAdapter {
  const name = provider ?? defaultProvider();
  if (!features.aiProviders.includes(name)) {
    throw new Error(
      `AI provider '${name}' is not enabled — add it to NEXT_PUBLIC_FEATURE_AI_PROVIDERS`,
    );
  }
  let adapter = cache.get(name);
  if (!adapter) {
    adapter = factories[name]();
    cache.set(name, adapter);
  }
  return adapter;
}

export type {
  AiAdapter,
  AiMessage,
  GenerateOptions,
  GenerateResult,
} from "./adapter";
