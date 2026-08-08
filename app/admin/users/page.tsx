import { AdminUsersTable } from "@/components/admin/AdminUsersTable";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { features } from "@/config/features";
import { requirePlatformStaff } from "@/lib/auth/roles";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Platform user management (product spec §9): search/view all users with
 * plan tier and month-to-date AI usage. Support admins can view; suspend/
 * ban/reactivate, the deletion trigger and plan changes are super-admin-only
 * (enforced in the routes, not just hidden here).
 */
export default async function AdminUsersPage() {
  const session = await requirePlatformStaff();

  // Plan names/prices are admin-editable, so the picker always reads the
  // plans table rather than naming tiers in code (§15).
  const plans =
    features.payments.enabled && session.user.isSuperAdmin
      ? (await db.listPlans())
          .filter((plan) => plan.isActive)
          .sort(
            (a, b) =>
              a.sortOrder - b.sortOrder || a.priceMonthly - b.priceMonthly,
          )
          .map((plan) => ({ id: plan.id, name: plan.name, slug: plan.slug }))
      : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>
          Every account on the platform — plan, usage, and account status.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AdminUsersTable
          isSuperAdmin={session.user.isSuperAdmin}
          plans={plans}
          currentUserId={session.user.id}
        />
      </CardContent>
    </Card>
  );
}
