"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Opens the Stripe customer portal (update card, cancel, invoices). */
export function ManageBillingButton() {
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const res = await fetch("/api/payments/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Could not open the billing portal");
        return;
      }
      window.location.href = data.url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={() => void open()}>
      {busy ? "Opening…" : "Manage billing"}
    </Button>
  );
}
