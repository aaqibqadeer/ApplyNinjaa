import { cn } from "@/lib/utils";

export interface SpinnerProps {
  className?: string;
  /** Announced to screen readers; the visual ring is decorative. */
  label?: string;
  size?: "sm" | "md" | "lg";
}

const SIZES: Record<NonNullable<SpinnerProps["size"]>, string> = {
  sm: "size-4 border-2",
  md: "size-6 border-2",
  lg: "size-8 border-[3px]",
};

/**
 * Token-only busy indicator. Server-safe (no state, no effects) so it can be
 * dropped into either kind of component. Pair it with text whenever the wait
 * is longer than a moment — a résumé parse takes ten seconds or more, and a
 * bare spinner doesn't tell anyone what is happening.
 */
export function Spinner({
  className,
  label = "Loading",
  size = "md",
}: SpinnerProps) {
  return (
    <span role="status" className={cn("inline-flex", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "border-muted-foreground/30 border-t-primary inline-block animate-spin rounded-full",
          SIZES[size],
        )}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
