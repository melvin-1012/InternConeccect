import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ListAdminUsersQueryParams,
  ListAdminUsersResponse,
  ListAuditEventsResponse,
  UpdateAdminUserBody,
  UpdateAdminUserParams,
  UpdateAdminUserResponse,
} from "@workspace/api-zod";
import { auditLogsTable, db, usersTable } from "@workspace/db";
import { requireRole, type AppActor } from "../lib/placementAuth";

const router: IRouter = Router();
const adminOnly = requireRole("administrator");

function actorFrom(res: { locals: Record<string, unknown> }): AppActor {
  return res.locals.actor as AppActor;
}

router.get("/admin/users", adminOnly, async (req, res): Promise<void> => {
  const query = ListAdminUsersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const conditions = [];
  if (query.data.role) conditions.push(eq(usersTable.role, query.data.role));
  if (query.data.search?.trim()) {
    const search = `%${query.data.search.trim()}%`;
    conditions.push(or(ilike(usersTable.name, search), ilike(usersTable.email, search))!);
  }

  const users = await db
    .select()
    .from(usersTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(usersTable.createdAt));
  res.json(
    ListAdminUsersResponse.parse(
      users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      })),
    ),
  );
});

router.patch("/admin/users/:id", adminOnly, async (req, res): Promise<void> => {
  const actor = actorFrom(res);
  const params = UpdateAdminUserParams.safeParse(req.params);
  const body = UpdateAdminUserBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (!body.data.role && !body.data.status) {
    res.status(400).json({ error: "Choose a role or account status to update." });
    return;
  }
  if (params.data.id === actor.id && (body.data.role !== "administrator" || body.data.status === "inactive")) {
    res.status(400).json({ error: "You cannot remove your own administrator access." });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set(body.data)
    .where(eq(usersTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  await db.insert(auditLogsTable).values({
    actorUserId: actor.id,
    actor: actor.name,
    action: "User account updated",
    target: updated.email,
    details: [body.data.role, body.data.status].filter(Boolean).join(" · "),
  });

  res.json(
    UpdateAdminUserResponse.parse({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      status: updated.status,
      createdAt: updated.createdAt,
    }),
  );
});

router.get("/admin/audit-events", adminOnly, async (_req, res): Promise<void> => {
  const events = await db
    .select()
    .from(auditLogsTable)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(100);
  res.json(
    ListAuditEventsResponse.parse(
      events.map((event) => ({
        id: event.id,
        actor: event.actor,
        action: event.action,
        target: event.target,
        createdAt: event.createdAt,
        details: event.details,
      })),
    ),
  );
});

export default router;
