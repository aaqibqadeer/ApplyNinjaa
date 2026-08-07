"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Shown to signed-in users who haven't verified their email yet. Verifying
 * activates the free trial, so this nudge matters.
 */
export function VerifyEmailBanner() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function resend() {
    setSending(true);
    try {
      const res = await fetch("/api/auth/verify-email/resend", {
        method: "POST",
      });
      if (res.ok) {
        setSent(true);
        toast.success("Verification email sent — check your inbox");
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Could not send the email");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-primary/30 bg-accent/50 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">Verify your email</p>
        <p className="text-muted-foreground text-xs">
          Confirm your address to activate your account and start your free
          free trial.
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={sending || sent}
        onClick={() => void resend()}
      >
        {sent ? "Sent ✓" : sending ? "Sending…" : "Resend email"}
      </Button>
    </div>
  );
}
