import { notFound } from "next/navigation";

import { SourcePacksManager } from "@/components/admin/SourcePacksManager";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { features } from "@/config/features";
import { requireSuperAdmin } from "@/lib/auth/roles";
import { listSourcePacks } from "@/lib/scrape/source-packs";

export const dynamic = "force-dynamic";

/**
 * Selector-pack CRUD — super-admin only (§14). Packs are platform-level (no
 * organization_id, like plans). 404 when the scraper product is off.
 */
export default async function AdminSourcePacksPage() {
  await requireSuperAdmin();
  if (!features.scraper.enabled) notFound();

  const packs = await listSourcePacks();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Source packs</CardTitle>
        <CardDescription>
          Server-pushed CSS selectors for the capture extension. Editing a pack
          fixes a DOM change without shipping a new build.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SourcePacksManager packs={packs} />
      </CardContent>
    </Card>
  );
}
