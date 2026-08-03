"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { createJob } from "@/components/jobs/api";
import {
  JOB_TYPES,
  JOB_TYPE_META,
  type CreateJobParams,
  type Job,
  type JobEstimate,
  type JobType,
} from "@/components/jobs/types";
import { listPrompts, type OfferPrompt } from "@/components/leads/prompts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { features } from "@/config/features";
import { cn } from "@/lib/utils";

/** The selection the job should run over. */
export interface JobSelection {
  leadIds?: string[];
  query?: Record<string, unknown>;
}

export interface RunAiPassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Number of leads the job will run over (for copy + client estimate). */
  selectedCount: number;
  /** Resolve the selection lazily at submit time (ids or selectAll+query). */
  getSelection: () => JobSelection;
  /** Called with the created job so the parent can surface progress. */
  onLaunched?: (job: Job) => void;
}

/** A job type is disabled when the flag it depends on is off. */
function disabledReason(type: JobType): string | null {
  if (type === "enrich" && !features.scraper.enrichment) {
    return "Enrichment is turned off for this workspace.";
  }
  if (type === "offer" && !features.scraper.offerLines) {
    return "Offer lines are turned off for this workspace.";
  }
  return null;
}

/**
 * Dialog to launch an AI pass over the current lead selection: pick a job type,
 * see an estimated AI-call count (server estimate when available, else a
 * client-side guess), and confirm. The `offer` type reveals a prompt picker,
 * variant count, and a "skip edited" toggle. Flag-gated types render disabled.
 */
export function RunAiPassDialog({
  open,
  onOpenChange,
  selectedCount,
  getSelection,
  onLaunched,
}: RunAiPassDialogProps) {
  const [type, setType] = useState<JobType>("normalize");
  const [variants, setVariants] = useState<1 | 3>(1);
  const [skipEdited, setSkipEdited] = useState(true);
  const [promptId, setPromptId] = useState<string>("");
  const [prompts, setPrompts] = useState<OfferPrompt[]>([]);
  const [estimate, setEstimate] = useState<JobEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const meta = JOB_TYPE_META[type];
  const disabled = disabledReason(type);

  /** Options bag for offer jobs (folded into params). */
  const offerParams = useCallback(
    (): Record<string, unknown> => ({
      promptId: promptId || undefined,
      variants,
      skipEdited,
    }),
    [promptId, variants, skipEdited],
  );

  // Load prompts once when the dialog opens (only needed for the offer type).
  useEffect(() => {
    if (!open) return;
    void (async () => {
      const result = await listPrompts();
      if (result.ok) {
        const list = result.data.prompts ?? [];
        setPrompts(list);
        const def = list.find((p) => p.isDefault) ?? list[0];
        if (def) setPromptId((prev) => prev || def.id);
      }
    })();
  }, [open]);

  // Fetch (or fall back to a client-side) AI-call estimate when the type or
  // offer options change while open.
  useEffect(() => {
    if (!open || disabled) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    setEstimating(true);
    void (async () => {
      const selection = getSelection();
      const params: CreateJobParams = {
        type,
        ...selection,
        estimateOnly: true,
        ...(type === "offer" ? { params: offerParams() } : {}),
      };
      const result = await createJob(params);
      if (cancelled) return;
      if (result.ok && result.data.estimate) {
        setEstimate(result.data.estimate);
      } else {
        // Client-side fallback: one AI call per lead (× variants for offers).
        const perLead = type === "offer" ? variants : 1;
        setEstimate(
          meta.consumesAi
            ? { aiCalls: selectedCount * perLead, remainingQuota: -1 }
            : { aiCalls: 0, remainingQuota: -1 },
        );
      }
      setEstimating(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type, variants, skipEdited, promptId, disabled, selectedCount]);

  async function handleRun() {
    if (disabled) return;
    setSubmitting(true);
    try {
      const selection = getSelection();
      const params: CreateJobParams = {
        type,
        ...selection,
        ...(type === "offer" ? { params: offerParams() } : {}),
      };
      const result = await createJob(params);
      if (result.ok && result.data.job) {
        toast.success(`${meta.label} started for ${selectedCount} lead(s)`);
        onLaunched?.(result.data.job);
        onOpenChange(false);
        return;
      }
      if (!result.ok) {
        if (result.status === 402 || result.code === "AI_CAP_REACHED") {
          toast.error(
            result.error ||
              "You've reached your monthly AI limit — upgrade to run more passes.",
          );
        } else {
          toast.error(result.error);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Run AI pass</DialogTitle>
          <DialogDescription>
            Run an AI pass over {selectedCount} selected lead
            {selectedCount === 1 ? "" : "s"}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {JOB_TYPES.map((jt) => {
              const jtMeta = JOB_TYPE_META[jt];
              const jtDisabled = disabledReason(jt) !== null;
              return (
                <button
                  key={jt}
                  type="button"
                  disabled={jtDisabled}
                  onClick={() => setType(jt)}
                  title={disabledReason(jt) ?? jtMeta.description}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    type === jt
                      ? "border-primary bg-primary/10 text-foreground"
                      : "hover:bg-accent",
                    jtDisabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  {jtMeta.label}
                </button>
              );
            })}
          </div>

          <p className="text-muted-foreground text-sm">{meta.description}</p>

          {type === "offer" && (
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="offer-prompt">Prompt</Label>
                <Select
                  id="offer-prompt"
                  value={promptId}
                  onChange={(e) => setPromptId(e.target.value)}
                >
                  {prompts.length === 0 && (
                    <option value="">Default prompt</option>
                  )}
                  {prompts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="offer-variants">Variants per lead</Label>
                <Select
                  id="offer-variants"
                  value={String(variants)}
                  onChange={(e) =>
                    setVariants(e.target.value === "3" ? 3 : 1)
                  }
                >
                  <option value="1">1 variant</option>
                  <option value="3">3 variants</option>
                </Select>
              </div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Skip leads with a hand-edited offer line</span>
                <Switch checked={skipEdited} onCheckedChange={setSkipEdited} />
              </label>
            </div>
          )}

          <div className="bg-muted/50 rounded-md border px-3 py-2 text-sm">
            {disabled ? (
              <span className="text-destructive">{disabled}</span>
            ) : estimating ? (
              <span className="text-muted-foreground">Estimating…</span>
            ) : !meta.consumesAi ? (
              <span className="text-muted-foreground">
                This pass doesn&apos;t consume AI calls.
              </span>
            ) : estimate ? (
              <span>
                Estimated{" "}
                <span className="font-medium">{estimate.aiCalls}</span> AI call
                {estimate.aiCalls === 1 ? "" : "s"}
                {estimate.remainingQuota >= 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {estimate.remainingQuota} remaining this month
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">
                Estimate unavailable.
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleRun()}
            disabled={submitting || disabled !== null || selectedCount === 0}
          >
            {submitting ? "Starting…" : `Run ${meta.label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
