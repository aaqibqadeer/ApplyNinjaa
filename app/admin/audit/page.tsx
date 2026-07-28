import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireSuperAdmin } from "@/lib/auth/roles";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Audit log of all admin actions — who, what, when, why (super-admin). */
export default async function AdminAuditPage() {
  await requireSuperAdmin();

  const { actions, total } = await db.listAdminActions({ limit: 100 });

  // Resolve actor/target emails in one batched pass.
  const userIds = Array.from(
    new Set(
      actions.flatMap((a) =>
        [a.actorUserId, a.targetUserId].filter((id): id is string =>
          Boolean(id),
        ),
      ),
    ),
  );
  const users = await Promise.all(userIds.map((id) => db.getUserById(id)));
  const emailById = new Map(
    users.filter((u) => u !== null).map((u) => [u.id, u.email]),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>
          Every admin action, newest first ({total} total, showing{" "}
          {actions.length}).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Why</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actions.map((action) => (
                <TableRow key={action.id}>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {action.createdAt.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">
                    {emailById.get(action.actorUserId) ?? action.actorUserId}
                    <span className="text-muted-foreground block text-xs">
                      {action.actorRole}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {action.action}
                  </TableCell>
                  <TableCell className="text-sm">
                    {action.targetUserId
                      ? (emailById.get(action.targetUserId) ??
                        action.targetUserId)
                      : (action.targetId ?? "—")}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-64 truncate text-xs">
                    {action.reason || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
