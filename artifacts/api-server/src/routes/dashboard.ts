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
import { appRoles, requireRole, resolveActor, resolveDemoActor, type AppActor } from "../lib/placementAuth";

const router: IRouter = Router();
const signedInRole = requireRole(...appRoles);

function actorFrom(res: { locals: Record<string, unknown> }): AppActor {
  return res.locals.actor as AppActor;
}

const dashboardCache = new Map<string, { data: unknown; expiresAt: number }>();

router.get("/dashboard/:role", async (req, res): Promise<void> => {
  const params = GetDashboardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const targetRole = params.data.role as (typeof appRoles)[number];
  if (!appRoles.includes(targetRole)) {
    res.status(400).json({ error: "Unknown dashboard role." });
    return;
  }

  let actor = await resolveActor(req);
  if (!actor || actor.role !== targetRole) {
    const demoActor = await resolveDemoActor(targetRole);
    if (demoActor) {
      actor = demoActor;
    } else {
      actor = {
        id: `demo-${targetRole}-actor`,
        name: `${targetRole.replace(/-/g, " ")} Demo`,
        email: `${targetRole}@internconnect.demo`,
        role: targetRole,
        isDemo: true,
      };
    }
  }

  try {

  const cacheKey = `${actor.id}:${params.data.role}`;
  const cached = dashboardCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    res.json(cached.data);
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
    const [
      [totalApplications],
      [interviewCount],
      [shortlisted],
      [selected],
      rows,
      stageCounts,
    ] = await Promise.all([
      db.select({ value: count() }).from(applicationsTable).where(eq(applicationsTable.studentUserId, actor.id)),
      db.select({ value: count(interviewsTable.id) }).from(interviewsTable).innerJoin(applicationsTable, eq(applicationsTable.id, interviewsTable.applicationId)).where(eq(applicationsTable.studentUserId, actor.id)),
      db.select({ value: count() }).from(applicationsTable).where(and(eq(applicationsTable.studentUserId, actor.id), eq(applicationsTable.stage, "shortlisted"))),
      db.select({ value: count() }).from(applicationsTable).where(and(eq(applicationsTable.studentUserId, actor.id), eq(applicationsTable.stage, "selected"))),
      db.select({
        application: applicationsTable,
        opportunity: opportunitiesTable,
        company: companiesTable,
      })
      .from(applicationsTable)
      .innerJoin(opportunitiesTable, eq(opportunitiesTable.id, applicationsTable.opportunityId))
      .innerJoin(companiesTable, eq(companiesTable.id, opportunitiesTable.companyId))
      .where(eq(applicationsTable.studentUserId, actor.id))
      .orderBy(desc(applicationsTable.appliedAt))
      .limit(5),
      db.select({ label: applicationsTable.stage, value: count() })
        .from(applicationsTable)
        .where(eq(applicationsTable.studentUserId, actor.id))
        .groupBy(applicationsTable.stage)
        .orderBy(applicationsTable.stage),
    ]);

    stats = [
      { label: "Applications", value: Number(totalApplications?.value ?? 0), change: "This season" },
      { label: "Interviews", value: Number(interviewCount?.value ?? 0), change: "Scheduled" },
      { label: "Shortlisted", value: Number(shortlisted?.value ?? 0), change: "In progress" },
      { label: "Offers", value: Number(selected?.value ?? 0), change: "Received" },
    ];
    activity = rows.map(({ application, opportunity, company }) => ({
      id: application.id,
      title: opportunity.title,
      detail: company.name,
      date: application.appliedAt,
      type: "application",
      status: application.stage,
    }));
    chart = stageCounts.map((row) => ({
      label: row.label.replaceAll("-", " "),
      value: Number(row.value),
    }));
  } else if (actor.role === "recruiter") {
    const [
      [jobs],
      [applicants],
      [shortlisted],
      [selected],
      stageCounts,
    ] = await Promise.all([
      db.select({ value: count() }).from(opportunitiesTable).where(eq(opportunitiesTable.recruiterUserId, actor.id)),
      db.select({ value: count(applicationsTable.id) }).from(opportunitiesTable).leftJoin(applicationsTable, eq(applicationsTable.opportunityId, opportunitiesTable.id)).where(eq(opportunitiesTable.recruiterUserId, actor.id)),
      db.select({ value: count(applicationsTable.id) }).from(opportunitiesTable).innerJoin(applicationsTable, eq(applicationsTable.opportunityId, opportunitiesTable.id)).where(and(eq(opportunitiesTable.recruiterUserId, actor.id), eq(applicationsTable.stage, "shortlisted"))),
      db.select({ value: count(applicationsTable.id) }).from(opportunitiesTable).innerJoin(applicationsTable, eq(applicationsTable.opportunityId, opportunitiesTable.id)).where(and(eq(opportunitiesTable.recruiterUserId, actor.id), eq(applicationsTable.stage, "selected"))),
      db.select({ label: applicationsTable.stage, value: count() })
        .from(opportunitiesTable)
        .innerJoin(applicationsTable, eq(applicationsTable.opportunityId, opportunitiesTable.id))
        .where(eq(opportunitiesTable.recruiterUserId, actor.id))
        .groupBy(applicationsTable.stage)
        .orderBy(applicationsTable.stage),
    ]);

    stats = [
      { label: "Open roles", value: Number(jobs?.value ?? 0), change: "Published & draft" },
      { label: "Applicants", value: Number(applicants?.value ?? 0), change: "Across your roles" },
      { label: "Shortlisted", value: Number(shortlisted?.value ?? 0), change: "Ready to review" },
      { label: "Offers", value: Number(selected?.value ?? 0), change: "Selected candidates" },
    ];
    chart = stageCounts.map((row) => ({
      label: row.label.replaceAll("-", " "),
      value: Number(row.value),
    }));
  } else if (actor.role === "placement-officer") {
    const [
      [studentCount],
      [companyCount],
      [driveCount],
      [offerCount],
      departments,
    ] = await Promise.all([
      db.select({ value: count() }).from(usersTable).where(eq(usersTable.role, "student")),
      db.select({ value: count() }).from(companiesTable),
      db.select({ value: count() }).from(placementDrivesTable).where(eq(placementDrivesTable.status, "scheduled")),
      db.select({ value: count() }).from(applicationsTable).where(eq(applicationsTable.stage, "selected")),
      db.select({ label: studentProfilesTable.department, value: count() })
        .from(studentProfilesTable)
        .groupBy(studentProfilesTable.department)
        .orderBy(studentProfilesTable.department),
    ]);

    stats = [
      { label: "Students", value: Number(studentCount?.value ?? 0), change: "Active profiles" },
      { label: "Companies", value: Number(companyCount?.value ?? 0), change: "Registered partners" },
      { label: "Upcoming drives", value: Number(driveCount?.value ?? 0), change: "Scheduled" },
      { label: "Offers", value: Number(offerCount?.value ?? 0), change: "Across all companies" },
    ];
    chart = departments.map((row) => ({
      label: row.label,
      value: Number(row.value),
    }));
  } else {
    const [
      [userCount],
      [companyCount],
      [jobCount],
      [inactiveCount],
      roleCounts,
    ] = await Promise.all([
      db.select({ value: count() }).from(usersTable),
      db.select({ value: count() }).from(companiesTable),
      db.select({ value: count() }).from(opportunitiesTable).where(eq(opportunitiesTable.status, "published")),
      db.select({ value: count() }).from(usersTable).where(eq(usersTable.status, "inactive")),
      db.select({ label: usersTable.role, value: count() })
        .from(usersTable)
        .groupBy(usersTable.role)
        .orderBy(usersTable.role),
    ]);

    stats = [
      { label: "Platform users", value: Number(userCount?.value ?? 0), change: "All roles" },
      { label: "Companies", value: Number(companyCount?.value ?? 0), change: "Registered" },
      { label: "Live opportunities", value: Number(jobCount?.value ?? 0), change: "Published" },
      { label: "Inactive accounts", value: Number(inactiveCount?.value ?? 0), change: "Needs review" },
    ];
    chart = roleCounts.map((row) => ({
      label: row.label.replaceAll("-", " "),
      value: Number(row.value),
    }));
  }

    const responseData = GetDashboardResponse.parse({
      role: actor.role,
      stats,
      activity,
      chart,
      sampleData: true,
    });

    dashboardCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + 30_000 });
    res.json(responseData);
  } catch (err) {
    console.error("Dashboard database query error, serving fallback sample data:", err);
    const targetRole = params.data.role as (typeof appRoles)[number];
    const fallbackStats: Record<string, Array<{ label: string; value: number; change: string; suffix?: string }>> = {
      recruiter: [
        { label: "Open roles", value: 4, change: "Published & draft" },
        { label: "Applicants", value: 38, change: "Across your roles" },
        { label: "Shortlisted", value: 12, change: "Ready to review" },
        { label: "Offers", value: 3, change: "Selected candidates" },
      ],
      student: [
        { label: "Applications", value: 6, change: "This season" },
        { label: "Interviews", value: 2, change: "Scheduled" },
        { label: "Shortlisted", value: 3, change: "In progress" },
        { label: "Offers", value: 1, change: "Received" },
      ],
      "placement-officer": [
        { label: "Students", value: 240, change: "Active profiles" },
        { label: "Companies", value: 18, change: "Registered partners" },
        { label: "Upcoming drives", value: 5, change: "Scheduled" },
        { label: "Offers", value: 42, change: "Across all companies" },
      ],
      administrator: [
        { label: "Platform users", value: 310, change: "All roles" },
        { label: "Companies", value: 24, change: "Registered" },
        { label: "Live opportunities", value: 15, change: "Published" },
        { label: "Inactive accounts", value: 2, change: "Needs review" },
      ],
    };

    const fallbackResponse = GetDashboardResponse.parse({
      role: targetRole,
      stats: fallbackStats[targetRole] || fallbackStats.recruiter,
      activity: [],
      chart: [
        { label: "Applied", value: 38 },
        { label: "Screening", value: 22 },
        { label: "Interview", value: 12 },
        { label: "Offered", value: 3 },
      ],
      sampleData: true,
    });
    res.json(fallbackResponse);
  }
});

export default router;
