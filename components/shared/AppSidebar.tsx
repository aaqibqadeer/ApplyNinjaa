"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { AppNav, type AppNavLink } from "@/components/shared/AppNav";
import { BrandMark } from "@/components/shared/BrandMark";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/brand";
import { cn } from "@/lib/utils";

export interface AppSidebarProps {
  links: AppNavLink[];
  userEmail: string;
  /**
   * The workspace switcher, pre-rendered by the server shell so this component
   * never needs to know about `features.multiTenant` or fetch orgs itself.
   */
  workspaceSwitcher?: ReactNode;
}

/**
 * The signed-in left navigation rail (it replaced the old top `AppHeader`, so
 * page content gets the full remaining width).
 *
 * Below `md` the rail becomes an off-canvas panel behind a hamburger in a slim
 * top bar; from `md` up it is a sticky in-flow column. Client component: it
 * owns the open/closed state and reads `usePathname` to close itself after a
 * navigation.
 */
export function AppSidebar({
  links,
  userEmail,
  workspaceSwitcher,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Navigating on mobile should dismiss the panel — otherwise it covers the
  // page the user just asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <div className="border-border bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4 backdrop-blur md:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls="app-sidebar"
          onClick={() => setOpen(true)}
        >
          <Menu className="size-5" aria-hidden="true" />
        </Button>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold"
        >
          <BrandMark />
          <span>{APP_NAME}</span>
        </Link>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        id="app-sidebar"
        className={cn(
          "bg-card border-border fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r transition-transform duration-200",
          "md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 px-4 md:h-16">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold"
          >
            <BrandMark />
            <span>{APP_NAME}</span>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close navigation"
            className="ml-auto md:hidden"
            onClick={() => setOpen(false)}
          >
            <X className="size-5" aria-hidden="true" />
          </Button>
        </div>

        <AppNav
          links={links}
          orientation="vertical"
          className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
        />

        <div className="border-border flex flex-col gap-3 border-t p-3">
          {workspaceSwitcher}
          <p
            className="text-muted-foreground truncate text-xs"
            title={userEmail}
          >
            {userEmail}
          </p>
          <div className="flex items-center gap-2">
            <LogoutButton />
            <div className="ml-auto hidden md:block">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
