/**
 * lib/ai/routing.ts — the ONE place that maps an AI task to a provider.
 *
 * ScrapperNinja runs several AI passes (extract, rescue, and the Phase 3
 * normalize/dedupe/label/enrich/score/offer set). Every one points at DeepSeek
 * today (locked decision #18), but keeping the mapping here means a task can be
 * re-pointed at another provider WITHOUT touching any call site — the call sites
 * do `ai(providerForTask(task))`.
 *
 * Pure config: imports only `config/features` (which never loads env), so this
 * module is safe to import from the pure-logic scrape modules and their tests.
 */

import { type AiProvider, features } from "@/config/features";

/** The AI-backed tasks in the ScrapperNinja pipeline. */
export const AI_TASKS = [
  "extract",
  "rescue",
  "normalize",
  "dedupe",
  "label",
  "enrich",
  "score",
  "offer",
] as const;
export type AiTask = (typeof AI_TASKS)[number];

/** Every task points at DeepSeek today (decision #18). Change here, not at
 * call sites. */
const TASK_PROVIDER: Record<AiTask, AiProvider> = {
  extract: "deepseek",
  rescue: "deepseek",
  normalize: "deepseek",
  dedupe: "deepseek",
  label: "deepseek",
  enrich: "deepseek",
  score: "deepseek",
  offer: "deepseek",
};

/**
 * The provider a task should run on. When the mapped provider isn't enabled in
 * this fork (`features.aiProviders`), fall back to the first enabled provider so
 * a fork that swaps DeepSeek for another provider still works without editing
 * every task mapping.
 */
export function providerForTask(task: AiTask): AiProvider {
  const preferred = TASK_PROVIDER[task];
  if (features.aiProviders.includes(preferred)) return preferred;
  return features.aiProviders[0] ?? preferred;
}
