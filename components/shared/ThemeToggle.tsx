"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Light/dark toggle. Swaps the `dark` class on <html> (the mechanism from
 * docs/architecture/theming.md) and persists the choice in localStorage; the
 * stored/system preference is applied pre-hydration by the inline script in
 * app/layout.tsx, so there is no flash of the wrong theme.
 *
 * Icon visibility is CSS-driven via the `dark:` variant — no client state, so
 * the markup is hydration-safe regardless of the active theme.
 */
export function ThemeToggle() {
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Storage unavailable (private mode) — the choice just won't persist.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Toggle dark mode"
    >
      <Sun className="hidden size-4 dark:block" aria-hidden="true" />
      <Moon className="size-4 dark:hidden" aria-hidden="true" />
    </Button>
  );
}
