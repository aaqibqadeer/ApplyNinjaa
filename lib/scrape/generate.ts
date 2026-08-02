/**
 * lib/scrape/generate.ts — shared JSON-from-model helpers for the scrape AI
 * tasks (rescue, extract, and the Phase 3 passes).
 *
 * `extractJson` is a PURE parser (the model may wrap JSON in prose/code fences);
 * it is exported so the task modules and their unit tests can validate model
 * output without any provider call.
 *
 * `generateJsonForTask` performs the actual generation. It imports the provider
 * accessor LAZILY (dynamic `import`) so that merely importing this module — or
 * the pure `parseRescueResponse` / `pickBestRepeatedGroup` helpers that depend
 * on it — never eagerly loads `config/env.schema` (which validates env at import
 * and would break the DB-free vitest run). The provider is resolved through
 * `lib/ai/routing` so a task can be re-pointed in one place.
 */

import type { z } from "zod";

import type { GenerateResult } from "@/lib/ai";
import { type AiTask, providerForTask } from "@/lib/ai/routing";

/** Model responses may wrap JSON in prose/code fences — extract the payload. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error("AI response contained no JSON");
  const trimmed = candidate.slice(start).trim();
  const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  if (end === -1) throw new Error("AI response contained no JSON");
  return JSON.parse(trimmed.slice(0, end + 1)) as unknown;
}

/** Trim overlong input so prompts stay within a sane token budget. */
export function clip(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

/**
 * Run one generation for `task`, extract + Zod-validate its JSON payload, and
 * return both the parsed data and the raw `GenerateResult` (for `recordAiCall`).
 */
export async function generateJsonForTask<T>(
  task: AiTask,
  schema: z.ZodType<T>,
  system: string,
  prompt: string,
): Promise<{ data: T; result: GenerateResult }> {
  // Lazy import keeps env.schema off the module-load path (test safety).
  const { ai } = await import("@/lib/ai");
  const result = await ai(providerForTask(task)).generate({
    system,
    prompt,
    temperature: 0,
  });
  const data = schema.parse(extractJson(result.text));
  return { data, result };
}
