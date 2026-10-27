import { and, count, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetDashboardParams,
  GetDashboardResponse,
} from "@workspace/api-zod";
import {
  applicationsTable,
  companiesTable,
  db,
  interviewsTable,
  opportunitiesTable,
  placementDrivesTable,
  studentProfilesTable,
  usersTable,
} from "@workspace/db";
import { appRoles, requireRole, type AppActor } from "../lib/placementAuth";

const router: IRouter = Router();
const signedInRole = requireRole(...appRoles);

function actorFrom(res: { locals: Record<string, unknown> }): AppActor {
  return res.locals.actor as AppActor;
}

router.get("/dashboard/:role", signedInRole, async (req, res): Promise<void> => {
  const actor = actorFrom(res);
  const params = GetDashboardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!appRoles.includes(params.data.role as (typeof appRoles)[number])) {
    res.status(400).json({ error: "Unknown dashboard role." });
    return;
  }
  if (actor.role !== params.data.role) {
    res.status(403).json({ error: "This dashboard is not available to your account." });
    return;
  }

  let stats: Array<{ label: string; value: number; change: string; suffix?: string }> = [];
  let activity: Array<{
    id: string;
    title: string;
    detail: string;
    date: Date;
    type: string;
    status?: string;
  }> = [];
  let chart: Array<{ label: string; value: number; secondary?: number }> = [];

  if (actor.role === "student") {
    const [totalApplications] = await db
      .select({ value: count() })
      .from(applicationsTable)
      .where(eq(applicationsTable.studentUserId, actor.id));
    const [interviewCount] = await db
      .select({ value: count(interviewsTable.id) })
      .from(interviewsTable)
      .innerJoin(applicationsTable, eq(applicationsTable.id, interviewsTable.applicationId))
      .where(eq(applicationsTable.studentUserId, actor.id));
    const [shortlisted] = await db
      .select({ value: count() })
      .from(applicationsTable)
      .where(
        and(
          eq(applicationsTable.studentUserId, actor.id),
          eq(applicationsTable.stage, "shortlisted"),
        ),
      );
    const [selected] = await db
      .select({ value: count() })
      .from(applicationsTable)
      .where(
        and(
          eq(applicationsTable.studentUserId, actor.id),
          eq(applicationsTable.stage, "selected"),
        ),
      );

    stats = [
      { label: "Applications", value: Number(totalApplications.value), change: "This season" },
      { label: "Interviews", value: Number(interviewCount.value), change: "Scheduled" },
      { label: "Shortlisted", value: Number(shortlisted.value), change: "In progress" },
      { label: "Offers", value: Number(selected.value), change: "Received" },
    ];
    const rows = await db
      .select({
        application: applicationsTable,
        opportunity: opportunitiesTable,
        company: companiesTable,
      })
      .from(applicationsTable)
      .innerJoin(opportunitiesTable, eq(opportunitiesTable.id, applicationsTable.opportunityId))
      .innerJoin(companiesTable, eq(companiesTable.id, opportunitiesTable.companyId))
      .where(eq(applicationsTable.studentUserId, actor.id))
      .orderBy(desc(applicationsTable.appliedAt))
      .limit(5);
    activity = rows.map(({ application, opportunity, company }) => ({
      id: application.id,
      title: opportunity.title,
      detail: company.name,
      date: application.appliedAt,
      type: "application",
      status: application.stage,
    }));
    const stageCounts = await db
      .select({ label: applicationsTable.stage, value: count() })
      .from(applicationsTable)
      .where(eq(applicationsTable.studentUserId, actor.id))
      .groupBy(applicationsTable.stage)
      .orderBy(applicationsTable.stage);
    chart = stageCounts.map((row) => ({
      label: row.label.replaceAll("-", " "),
      value: Number(row.value),
    }));
  } else if (actor.role === "recruiter") {
    const [jobs] = await db
      .select({ value: count() })
      .from(opportunitiesTable)
      .where(eq(opportunitiesTable.recruiterUserId, actor.id));
    const [applicants] = await db
      .select({ value: count(applicationsTable.id) })
      .from(opportunitiesTable)
      .leftJoin(applicationsTable, eq(applicationsTable.opportunityId, opportunitiesTable.id))
      .where(eq(opportunitiesTable.recruiterUserId, actor.id));
    const [shortlisted] = await db
      .select({ value: count(applicationsTable.id) })
      .from(opportunitiesTable)
      .innerJoin(applicationsTable, eq(applicationsTable.opportunityId, opportunitiesTable.id))
      .where(
        and(
          eq(opportunitiesTable.recruiterUserId, actor.id),
          eq(applicationsTable.stage, "shortlisted"),
        ),
      );
    const [selected] = await db
      .select({ value: count(applicationsTable.id) })
      .from(opportunitiesTable)
      .innerJoin(applicationsTable, eq(applicationsTable.opportunityId, opportunitiesTable.id))
      .where(
        and(
          eq(opportunitiesTable.recruiterUserId, actor.id),
          eq(applicationsTable.stage, "selected"),
        ),
      );
    stats = [
      { label: "Open roles", value: Number(jobs.value), change: "Published & draft" },
      { label: "Applicants", value: Number(applicants.value), change: "Across your roles" },
      { label: "Shortlisted", value: Number(shortlisted.value), change: "Ready to review" },
      { label: "Offers", value: Number(selected.value), change: "Selected candidates" },
    ];
    const stageCounts = await db
      .select({ label: applicationsTable.stage, value: count() })
      .from(opportunitiesTable)
      .innerJoin(applicationsTable, eq(applicationsTable.opportunityId, opportunitiesTable.id))
      .where(eq(opportunitiesTable.recruiterUserId, actor.id))
      .groupBy(applicationsTable.stage)
      .orderBy(applicationsTable.stage);
    chart = stageCounts.map((row) => ({
      label: row.label.replaceAll("-", " "),
      value: Number(row.value),
    }));
  } else if (actor.role === "placement-officer") {
    const [studentCount] = await db
      .select({ value: count() })
      .from(usersTable)
      .where(eq(usersTable.role, "student"));
    const [companyCount] = await db.select({ value: count() }).from(companiesTable);
    const [driveCount] = await db
      .select({ value: count() })
      .from(placementDrivesTable)
      .where(eq(placementDrivesTable.status, "scheduled"));
    const [offerCount] = await db
      .select({ value: count() })
      .from(applicationsTable)
      .where(eq(applicationsTable.stage, "selected"));
    stats = [
      { label: "Students", value: Number(studentCount.value), change: "Active profiles" },
      { label: "Companies", value: Number(companyCount.value), change: "Registered partners" },
      { label: "Upcoming drives", value: Number(driveCount.value), change: "Scheduled" },
      { label: "Offers", value: Number(offerCount.value), change: "Across all companies" },
    ];
    const departments = await db
      .select({ label: studentProfilesTable.department, value: count() })
      .from(studentProfilesTable)
      .groupBy(studentProfilesTable.department)
      .orderBy(studentProfilesTable.department);
    chart = departments.map((row) => ({
      label: row.label,
      value: Number(row.value),
    }));
  } else {
    const [userCount] = await db.select({ value: count() }).from(usersTable);
    const [companyCount] = await db.select({ value: count() }).from(companiesTable);
    const [jobCount] = await db
      .select({ value: count() })
      .from(opportunitiesTable)
      .where(eq(opportunitiesTable.status, "published"));
    const [inactiveCount] = await db
      .select({ value: count() })
      .from(usersTable)
      .where(eq(usersTable.status, "inactive"));
    stats = [
      { label: "Platform users", value: Number(userCount.value), change: "All roles" },
      { label: "Companies", value: Number(companyCount.value), change: "Registered" },
      { label: "Live opportunities", value: Number(jobCount.value), change: "Published" },
      { label: "Inactive accounts", value: Number(inactiveCount.value), change: "Needs review" },
    ];
    const roleCounts = await db
      .select({ label: usersTable.role, value: count() })
      .from(usersTable)
      .groupBy(usersTable.role)
      .orderBy(usersTable.role);
    chart = roleCounts.map((row) => ({
      label: row.label.replaceAll("-", " "),
      value: Number(row.value),
    }));
  }

  res.json(
    GetDashboardResponse.parse({
      role: actor.role,
      stats,
      activity,
      chart,
      sampleData: true,
    }),
  );
});

export default router;
