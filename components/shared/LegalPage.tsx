import type { ReactNode } from "react";

import { SiteFooter } from "@/components/shared/SiteFooter";
import { SiteHeader } from "@/components/shared/SiteHeader";

export interface LegalPageProps {
  title: string;
  /** Human-readable "Last updated" date. */
  updated: string;
  children: ReactNode;
}

/**
 * Shell for public legal documents (privacy/terms/cookie policy): marketing
 * header + footer around a readable article column. Headings/paragraphs are
 * styled here so the content pages stay plain semantic HTML.
 */
export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {title}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Last updated: {updated}
        </p>
        <article className="mt-8 flex flex-col gap-4 text-sm leading-6 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1">
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
