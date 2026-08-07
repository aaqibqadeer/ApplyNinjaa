/**
 * lib/ai/deepseek/adapter.ts — DeepSeek implementation of AiAdapter.
 *
 * DeepSeek exposes an OpenAI-compatible Chat Completions API, so this adapter
 * reuses the `openai` SDK pointed at DeepSeek's base URL. The only module that
 * knows about DeepSeek; reads its key from the validated `env` (never
 * `process.env`, §4).
 */

import OpenAI from "openai";

import { env } from "@/config/env.schema";

import type { AiAdapter, GenerateOptions, GenerateResult } from "../adapter";
import { DEFAULT_MODELS } from "../models";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`DeepSeekAdapter: ${name} is not configured`);
  return value;
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Build the Chat Completions payload shared by generate() and stream(). */
function toChatParams(options: GenerateOptions) {
  const turns = options.messages ?? [
    { role: "user" as const, content: options.prompt ?? "" },
  ];
  const messages: ChatMessage[] = [
    ...(options.system
      ? [{ role: "system" as const, content: options.system }]
      : []),
    ...turns.map((m) => ({ role: m.role, content: m.content })),
  ];
  return {
    model: options.model ?? DEFAULT_MODELS.deepseek,
    messages,
    ...(options.maxTokens !== undefined
      ? { max_tokens: options.maxTokens }
      : {}),
    ...(options.temperature !== undefined
      ? { temperature: options.temperature }
      : {}),
  };
}

export class DeepSeekAdapter implements AiAdapter {
  readonly provider = "deepseek" as const;
  private readonly client: OpenAI;

  constructor(client?: OpenAI) {
    this.client =
      client ??
      new OpenAI({
        apiKey: required("DEEPSEEK_API_KEY", env.DEEPSEEK_API_KEY),
        baseURL: DEEPSEEK_BASE_URL,
      });
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const completion = await this.client.chat.completions.create({
      ...toChatParams(options),
      stream: false,
    });
    const text = completion.choices[0]?.message?.content ?? "";
    return { text, model: completion.model, provider: this.provider };
  }

  async *stream(options: GenerateOptions): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      ...toChatParams(options),
      stream: true,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
