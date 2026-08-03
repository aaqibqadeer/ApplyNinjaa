"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  createPrompt,
  deletePrompt,
  listPrompts,
  previewPrompt,
  updatePrompt,
  type OfferPrompt,
} from "@/components/leads/prompts";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Lead } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

const EMPTY_FORM = { name: "", text: "", isDefault: false };

/**
 * CRUD manager for offer-line prompts with a live preview against a real recent
 * lead. Left: the prompt list + "New prompt". Right: an editor (name, template
 * text, default toggle) and a preview panel that renders the current text for a
 * chosen lead via `POST /api/prompts/preview`. Degrades gracefully (404).
 */
export function OfferPromptsManager() {
  const [prompts, setPrompts] = useState<OfferPrompt[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [previewLeadId, setPreviewLeadId] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const isNew = selectedId === null;

  const load = useCallback(async () => {
    const result = await listPrompts();
    if (result.ok) {
      setUnavailable(false);
      setPrompts(result.data.prompts ?? []);
    } else {
      setUnavailable(result.status === 404);
      setPrompts([]);
      if (result.status !== 404) toast.error(result.error);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Recent leads to preview against.
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/leads?pageSize=25&sort=createdAt&dir=desc");
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({}))) as { leads?: Lead[] };
      const list = data.leads ?? [];
      setLeads(list);
      if (list[0]) setPreviewLeadId((prev) => prev || list[0].id);
    })();
  }, []);

  function selectPrompt(prompt: OfferPrompt) {
    setSelectedId(prompt.id);
    setForm({
      name: prompt.name,
      text: prompt.text,
      isDefault: prompt.isDefault ?? false,
    });
    setPreview(null);
  }

  function startNew() {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setPreview(null);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.text.trim()) {
      toast.error("Name and template text are required");
      return;
    }
    setSaving(true);
    try {
      const result = isNew
        ? await createPrompt(form)
        : await updatePrompt(selectedId, form);
      if (result.ok && result.data.prompt) {
        toast.success(isNew ? "Prompt created" : "Prompt saved");
        setSelectedId(result.data.prompt.id);
        await load();
      } else if (!result.ok) {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (isNew) return;
    const result = await deletePrompt(selectedId);
    if (result.ok) {
      toast.success("Prompt deleted");
      startNew();
      await load();
    } else {
      throw new Error(result.error);
    }
  }

  async function handlePreview() {
    if (!previewLeadId) {
      toast.error("Pick a lead to preview against");
      return;
    }
    setPreviewing(true);
    setPreview(null);
    try {
      const result = await previewPrompt({
        leadId: previewLeadId,
        ...(isNew ? { promptText: form.text } : { promptId: selectedId }),
      });
      if (result.ok) {
        setPreview(result.data.rendered ?? "");
      } else {
        toast.error(result.error);
      }
    } finally {
      setPreviewing(false);
    }
  }

  if (prompts === null) {
    return <p className="text-muted-foreground text-sm">Loading prompts…</p>;
  }

  if (unavailable) {
    return (
      <EmptyState
        title="Offer prompts aren't available yet"
        description="The offer-line generation feature hasn't been enabled on this workspace."
      />
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
      {/* Prompt list */}
      <div className="flex flex-col gap-2">
        <Button size="sm" onClick={startNew} variant={isNew ? "default" : "outline"}>
          New prompt
        </Button>
        <ul className="flex flex-col gap-1">
          {prompts.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => selectPrompt(p)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  selectedId === p.id
                    ? "border-primary bg-primary/10"
                    : "hover:bg-accent",
                )}
              >
                <span className="truncate">{p.name}</span>
                {p.isDefault && <Badge variant="secondary">default</Badge>}
              </button>
            </li>
          ))}
          {prompts.length === 0 && (
            <li className="text-muted-foreground px-1 py-2 text-sm">
              No prompts yet — create one.
            </li>
          )}
        </ul>
      </div>

      {/* Editor + preview */}
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prompt-name">Name</Label>
            <Input
              id="prompt-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Friendly local-business opener"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prompt-text">Template</Label>
            <Textarea
              id="prompt-text"
              value={form.text}
              rows={6}
              onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
              placeholder="Write a one-line opener for {{businessName}} in {{city}}…"
            />
            <p className="text-muted-foreground text-xs">
              Use {"{{businessName}}"}, {"{{city}}"}, {"{{category}}"}, etc. to
              reference lead fields.
            </p>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Default prompt for offer passes</span>
            <Switch
              checked={form.isDefault}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: v }))}
            />
          </label>
          <div className="flex items-center justify-end gap-2">
            {!isNew && (
              <ConfirmDialog
                title="Delete this prompt?"
                description="This can't be undone."
                confirmLabel="Delete"
                destructive
                onConfirm={handleDelete}
                trigger={
                  <Button variant="destructive" size="sm">
                    Delete
                  </Button>
                }
              />
            )}
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create prompt" : "Save changes"}
            </Button>
          </div>
        </div>

        {/* Live preview */}
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <p className="text-sm font-medium">Live preview</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="preview-lead">Preview against</Label>
              <Select
                id="preview-lead"
                value={previewLeadId}
                onChange={(e) => setPreviewLeadId(e.target.value)}
              >
                {leads.length === 0 && <option value="">No recent leads</option>}
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.businessName}
                    {l.address?.city ? ` — ${l.address.city}` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handlePreview()}
              disabled={previewing || !previewLeadId || !form.text.trim()}
            >
              {previewing ? "Rendering…" : "Preview"}
            </Button>
          </div>
          {preview !== null && (
            <div className="bg-muted/50 rounded-md border px-3 py-2 text-sm">
              {preview || (
                <span className="text-muted-foreground">
                  (empty result)
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
