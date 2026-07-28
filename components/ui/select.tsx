import type * as React from "react";

import { cn } from "@/lib/utils";

export type SelectProps = React.ComponentProps<"select">;

/**
 * Styled native <select>. Kept dependency-free deliberately (same reasoning as
 * Switch) — the native control is accessible, keyboard-friendly, and enough
 * for the dropdown value sets this product uses.
 */
export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
