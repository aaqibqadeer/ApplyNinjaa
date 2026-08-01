"use client";

import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import {
  Dialog,
  DialogOverlay,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  /** Optional pinned footer (e.g. action buttons). */
  footer?: ReactNode;
  className?: string;
}

/**
 * A right-side panel. There is no Sheet primitive in this template, so it
 * adapts the Radix Dialog (`components/ui/dialog.tsx`) — same overlay/focus
 * management, restyled as a full-height panel docked to the right.
 */
export function DetailDrawer({
  open,
  onOpenChange,
  title,
  children,
  footer,
  className,
}: DetailDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal data-slot="dialog-portal">
        <DialogOverlay />
        <DialogPrimitive.Content
          data-slot="detail-drawer-content"
          className={cn(
            "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l shadow-lg duration-200",
            className,
          )}
        >
          <div className="flex items-center justify-between gap-4 border-b px-6 py-4">
            <DialogTitle>{title}</DialogTitle>
            <DialogPrimitive.Close
              className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none"
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
