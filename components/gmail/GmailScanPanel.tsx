"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Proposal {
  messageId: string;
  from: string;
  subject: string;
  excerpt: string;
  classification: string;
  matchedApplicationId: string | null;
  suggestedStatus: string | null;
  decision: "approved" | "rejected" | null;
}

interface Scan {
  id: string;
  status: "running" | "ready" | "failed";
  error: string | null;
  rangeFrom: string;
  rangeTo: string;
  createdAt: string;
  proposals: Proposal[];
}

interface Connection {
  emailAddress: string | null;
  connectedAt: string;
}

function isoDay(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Gmail integration panel: separate opt-in connect, manual date-range scans,
 * and per-proposal approve/reject (nothing updates the tracker without an
 * explicit approval).
 */
export function GmailScanPanel() {
  const [connection, setConnection] = useState<Connection | null | undefined>();
  const [scans, setScans] = useState<Scan[]>([]);
  const [from, setFrom] = useState(isoDay(-14));
  const [to, setTo] = useState(isoDay(0));
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const res = await fetch("/api/gmail/status");
    if (res.ok) {
      const data = (await res.json()) as {
        connection: Connection | null;
        scans: Scan[];
      };
      setConnection(data.connection);
      setScans(data.scans);
    } else {
      setConnection(null);
    }
  }

  async function scanNow() {
    setScanning(true);
    try {
      const res = await fetch("/api/gmail/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Scan failed");
      } else {
        toast.success("Scan complete — review the proposals below");
      }
      await refresh();
    } finally {
      setScanning(false);
    }
  }

  async function decide(
    scanId: string,
    messageId: string,
    decision: "approved" | "rejected",
  ) {
    const res = await fetch(`/api/gmail/scans/${scanId}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, decision }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? "Could not save the decision");
      return;
    }
    await refresh();
  }

  async function disconnect() {
    const res = await fetch("/api/gmail/disconnect", { method: "POST" });
    if (res.ok) {
      toast.success("Gmail disconnected");
      await refresh();
    }
  }

  if (connection === undefined) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  if (!connection) {
    return (
      <div className="border-border flex flex-col items-start gap-3 rounded-lg border p-6">
        <p className="text-sm font-medium">Connect Gmail (read-only)</p>
        <p className="text-muted-foreground text-sm">
          A separate, optional permission — we request read-only access, scan
          only when you click Scan Now, read only message headers and
          snippets, and never change or send anything. You approve every
          status update before it touches your tracker. Disconnect anytime.
        </p>
        <Button asChild>
          <a href="/api/gmail/connect">Connect Gmail</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">
            Connected: {connection.emailAddress ?? "your Gmail account"}
          </p>
          <p className="text-muted-foreground text-xs">
            Read-only access — scans run only when you start one.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void disconnect()}>
          Disconnect
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scan-from">From</Label>
          <Input
            id="scan-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scan-to">To</Label>
          <Input
            id="scan-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <Button disabled={scanning} onClick={() => void scanNow()}>
          {scanning ? "Scanning…" : "Scan Now"}
        </Button>
        <p className="text-muted-foreground text-xs">
          Up to 50 emails per scan · counts as 1 AI action
        </p>
      </div>

      {scans.map((scan) => (
        <div key={scan.id} className="border-border rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">
              {new Date(scan.rangeFrom).toLocaleDateString()} –{" "}
              {new Date(scan.rangeTo).toLocaleDateString()}
            </p>
            <Badge
              variant={
                scan.status === "ready"
                  ? "secondary"
                  : scan.status === "failed"
                    ? "destructive"
                    : "outline"
              }
            >
              {scan.status}
            </Badge>
          </div>
          {scan.error && (
            <p className="text-destructive mb-2 text-xs">{scan.error}</p>
          )}
          {scan.status === "ready" && scan.proposals.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No job-related emails found in this range.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {scan.proposals.map((p) => (
              <li
                key={p.messageId}
                className="border-border flex flex-col gap-2 rounded-md border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium">
                    {p.subject || "(no subject)"}
                  </p>
                  <Badge variant="outline">{p.classification}</Badge>
                </div>
                <p className="text-muted-foreground truncate text-xs">
                  {p.from}
                </p>
                <p className="text-muted-foreground text-xs">{p.excerpt}</p>
                {p.matchedApplicationId && p.suggestedStatus ? (
                  p.decision ? (
                    <p className="text-muted-foreground text-xs">
                      {p.decision === "approved"
                        ? `Applied — status set to ${p.suggestedStatus}`
                        : "Dismissed"}
                    </p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs">
                        Set matching application to{" "}
                        <strong>{p.suggestedStatus}</strong>?
                      </span>
                      <Button
                        size="sm"
                        onClick={() =>
                          void decide(scan.id, p.messageId, "approved")
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void decide(scan.id, p.messageId, "rejected")
                        }
                      >
                        Dismiss
                      </Button>
                    </div>
                  )
                ) : (
                  <p className="text-muted-foreground text-xs">
                    No matching tracked application.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
