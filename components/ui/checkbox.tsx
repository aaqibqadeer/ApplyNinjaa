import type * as React from "react";

import { cn } from "@/lib/utils";

export type CheckboxProps = React.ComponentProps<"input">;

/** Styled native checkbox (dependency-free, like Switch/Select). */
export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={cn(
        "border-input accent-primary focus-visible:ring-ring size-4 shrink-0 rounded border focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
