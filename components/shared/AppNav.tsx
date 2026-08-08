"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export interface AppNavLink {
  href: string;
  label: string;
}

interface AppNavProps {
  links: AppNavLink[];
  className?: string;
  /** `vertical` stacks the links full-width — the sidebar layout. */
  orientation?: "horizontal" | "vertical";
}

/**
 * In-app nav links with active-route highlighting. Client-only so it can read
 * `usePathname`; the link set is computed on the server (from flags + the
 * viewer's role) and passed in as plain data — see `AppShell`.
 */
export function AppNav({
  links,
  className,
  orientation = "horizontal",
}: AppNavProps) {
  const pathname = usePathname();
  const vertical = orientation === "vertical";

  return (
    <nav
      className={cn(
        "flex gap-1",
        vertical ? "flex-col items-stretch" : "items-center",
        className,
      )}
    >
      {links.map((link) => {
        const active =
          link.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              vertical && "py-2",
              active
                ? "bg-secondary text-secondary-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
