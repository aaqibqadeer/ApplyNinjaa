import Link from "next/link";

import { BrandMark } from "@/components/shared/BrandMark";
import { APP_NAME } from "@/config/brand";

/**
 * Public site footer for marketing/legal pages, with the compliance links
 * (product spec §11). The year is computed at render (server component).
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-border border-t">
      <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm sm:flex-row">
        <div className="flex items-center gap-2">
          <BrandMark />
          <span className="text-foreground font-medium">{APP_NAME}</span>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <Link
            href="/privacy"
            className="hover:text-foreground transition-colors"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="hover:text-foreground transition-colors"
          >
            Terms of Service
          </Link>
          <Link
            href="/cookie-policy"
            className="hover:text-foreground transition-colors"
          >
            Cookie Policy
          </Link>
          <Link
            href="/login"
            className="hover:text-foreground transition-colors"
          >
            Log in
          </Link>
        </nav>
        <span>© {year}</span>
      </div>
    </footer>
  );
}
