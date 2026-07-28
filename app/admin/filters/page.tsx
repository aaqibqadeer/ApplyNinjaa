import { AdminFilterManager } from "@/components/admin/AdminFilterManager";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

/** Valid Job filter master list (super-admin CRUD, product spec §9). */
export default async function AdminFiltersPage() {
  await requireSuperAdmin();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Valid Job filters</CardTitle>
        <CardDescription>
          The default filters every user sees. Deactivate to hide one without
          deleting it; the guidance text steers the AI classifier.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AdminFilterManager />
      </CardContent>
    </Card>
  );
}
