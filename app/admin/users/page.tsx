import { AdminUsersTable } from "@/components/admin/AdminUsersTable";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePlatformStaff } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

/**
 * Platform user management (product spec §9): search/view all users with
 * plan tier and month-to-date AI usage. Support admins can view; suspend/
 * ban/reactivate and the deletion trigger are super-admin-only (enforced in
 * the routes, not just hidden here).
 */
export default async function AdminUsersPage() {
  const session = await requirePlatformStaff();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>
          Every account on the platform — plan, usage, and account status.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AdminUsersTable isSuperAdmin={session.user.isSuperAdmin} />
      </CardContent>
    </Card>
  );
}
