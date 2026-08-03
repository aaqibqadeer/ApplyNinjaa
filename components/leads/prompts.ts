/**
 * components/leads/prompts.ts — client types + thin fetch wrappers for offer
 * prompts (Phase 3). The backend `/api/prompts*` routes are owned by a separate
 * agent; these wrappers degrade gracefully (status-carrying results) so the UI
 * can be built and typechecked before they land.
 *
 * Import-safe from client components only (uses `fetch`).
 */

/** A reusable offer-line prompt template. */
export interface OfferPrompt {
  id: string;
  name: string;
  /** The template text; may contain `{{placeholders}}` for lead fields. */
  text: string;
  isDefault?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

/** Result of previewing a prompt against a real lead. */
export interface PromptPreview {
  /** The rendered offer line for the sample lead. */
  rendered: string;
  /** Optional echo of the lead fields used to render. */
  sample?: Record<string, unknown>;
}

export type PromptsResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; code?: string };

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

async function request<T>(
  input: string,
  init?: RequestInit,
): Promise<PromptsResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return { ok: false, status: 0, error: "Network error — please retry." };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, status: res.status, data: body as T };
  return {
    ok: false,
    status: res.status,
    error:
      typeof body.error === "string"
        ? body.error
        : res.status === 404
          ? "Offer prompts aren't available yet."
          : "Something went wrong.",
    code: typeof body.code === "string" ? body.code : undefined,
  };
}

export function listPrompts(): Promise<PromptsResult<{ prompts: OfferPrompt[] }>> {
  return request<{ prompts: OfferPrompt[] }>("/api/prompts");
}

export function createPrompt(input: {
  name: string;
  text: string;
  isDefault?: boolean;
}): Promise<PromptsResult<{ prompt: OfferPrompt }>> {
  return request<{ prompt: OfferPrompt }>("/api/prompts", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export function updatePrompt(
  id: string,
  patch: Partial<Pick<OfferPrompt, "name" | "text" | "isDefault">>,
): Promise<PromptsResult<{ prompt: OfferPrompt }>> {
  return request<{ prompt: OfferPrompt }>(`/api/prompts/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

export function deletePrompt(id: string): Promise<PromptsResult<unknown>> {
  return request<unknown>(`/api/prompts/${id}`, { method: "DELETE" });
}

/** Preview a prompt (by id or ad-hoc text) rendered against one lead. */
export function previewPrompt(input: {
  promptId?: string;
  promptText?: string;
  leadId: string;
}): Promise<PromptsResult<PromptPreview>> {
  return request<PromptPreview>("/api/prompts/preview", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}
