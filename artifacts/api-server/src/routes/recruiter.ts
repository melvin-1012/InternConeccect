import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateOpportunityBody,
  CreateOpportunityResponse,
  DeleteOpportunityParams,
  GetRecruiterCompanyResponse,
  ListOpportunityApplicantsQueryParams,
  ListOpportunityApplicantsResponse,
  ScheduleInterviewBody,
  ScheduleInterviewParams,
  ScheduleInterviewResponse,
  UpdateApplicationStageBody,
  UpdateApplicationStageParams,
  UpdateApplicationStageResponse,
  UpdateOpportunityBody,
  UpdateOpportunityParams,
  UpdateOpportunityResponse,
  UpdateRecruiterCompanyBody,
  UpdateRecruiterCompanyResponse,
} from "@workspace/api-zod";
import {
  applicationsTable,
  auditLogsTable,
  companiesTable,
  db,
  opportunitiesTable,
  interviewsTable,
  notificationsTable,
  studentProfilesTable,
  usersTable,
} from "@workspace/db";
import { requireRole, type AppActor } from "../lib/placementAuth";
import { memoryCache } from "../lib/memoryCache";

const router: IRouter = Router();
const recruiterOnly = requireRole("recruiter");

function actorFrom(res: { locals: Record<string, unknown> }): AppActor {
  return res.locals.actor as AppActor;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function companyForActor(actor: AppActor) {
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, actor.id))
    .limit(1);
  return company;
}

router.get("/recruiter/company", recruiterOnly, async (_req, res): Promise<void> => {
  const actor = actorFrom(res);
  const cacheKey = `recruiter:company:${actor.id}`;
  const cached = memoryCache.get<unknown>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const company = await companyForActor(actor);
  if (!company) {
    res.status(404).json({ error: "Company profile not found." });
    return;
  }

  const [open] = await db
    .select({ value: count() })
    .from(opportunitiesTable)
    .where(
      and(
        eq(opportunitiesTable.companyId, company.id),
        eq(opportunitiesTable.status, "published"),
      ),
    );

  const responseData = GetRecruiterCompanyResponse.parse({
    id: company.id,
    name: company.name,
    industry: company.industry,
    location: company.location,
    website: company.website,
    description: company.description,
    verified: company.verified,
    openRoles: Number(open.value),
  });

  memoryCache.set(cacheKey, responseData, 120_000);
  res.json(responseData);
});

router.put("/recruiter/company", recruiterOnly, async (req, res): Promise<void> => {
  const actor = actorFrom(res);
  const body = UpdateRecruiterCompanyBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const company = await companyForActor(actor);
  if (!company) {
    res.status(404).json({ error: "Company profile not found." });
    return;
  }
  const [updated] = await db
    .update(companiesTable)
    .set(body.data)
    .where(eq(companiesTable.id, company.id))
    .returning();
  const [open] = await db
    .select({ value: count() })
    .from(opportunitiesTable)
    .where(
      and(
        eq(opportunitiesTable.companyId, updated.id),
        eq(opportunitiesTable.status, "published"),
      ),
    );
  res.json(
    UpdateRecruiterCompanyResponse.parse({
      id: updated.id,
      name: updated.name,
      industry: updated.industry,
      location: updated.location,
      website: updated.website,
      description: updated.description,
      verified: updated.verified,
      openRoles: Number(open.value),
    }),
  );
});

router.post("/opportunities", recruiterOnly, async (req, res): Promise<void> => {
  const actor = actorFrom(res);
  const body = CreateOpportunityBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const company = await companyForActor(actor);
  if (!company) {
    res.status(403).json({ error: "Complete your company profile before posting a role." });
    return;
  }
  if (body.data.company.trim().toLowerCase() !== company.name.trim().toLowerCase()) {
    res.status(400).json({ error: "The opportunity must be posted under your verified company." });
    return;
  }

  const [opportunity] = await db
    .insert(opportunitiesTable)
    .values({
      companyId: company.id,
      recruiterUserId: actor.id,
      title: body.data.title,
      location: body.data.location,
      mode: body.data.mode,
      type: body.data.type,
      department: body.data.department,
      deadline: formatDate(body.data.deadline),
      status: body.data.status ?? "published",
      skills: body.data.skills ?? [],
      description: body.data.description,
      stipend: body.data.stipend,
      salary: body.data.salary ?? null,
      duration: body.data.duration ?? null,
      eligibility: body.data.eligibility ?? "Open to eligible students",
    })
    .returning();

  await db.insert(auditLogsTable).values({
    actorUserId: actor.id,
    actor: actor.name,
    action: "Opportunity created",
    target: opportunity.title,
    details: opportunity.status,
  });

  res.status(201).json(
    CreateOpportunityResponse.parse({
      ...opportunity,
      company: company.name,
      companyId: company.id,
      companyLogo: null,
      applicants: 0,
      matchScore: 72,
      verified: company.verified,
    }),
  );
});

router.patch("/opportunities/:id", recruiterOnly, async (req, res): Promise<void> => {
  const actor = actorFrom(res);
  const params = UpdateOpportunityParams.safeParse(req.params);
  const body = UpdateOpportunityBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (!isUuid(params.data.id)) {
    res.status(404).json({ error: "Opportunity not found." });
    return;
  }

  const [existing] = await db
    .select({ opportunity: opportunitiesTable, company: companiesTable })
    .from(opportunitiesTable)
    .innerJoin(companiesTable, eq(companiesTable.id, opportunitiesTable.companyId))
    .where(eq(opportunitiesTable.id, params.data.id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Opportunity not found." });
    return;
  }
  if (!actor.isDemo && existing.opportunity.recruiterUserId !== actor.id && existing.company.ownerUserId !== actor.id) {
    res.status(403).json({ error: "You can only update your own opportunities." });
    return;
  }

  const { deadline, ...opportunityUpdates } = body.data;
  const [updated] = await db
    .update(opportunitiesTable)
    .set({
      ...opportunityUpdates,
      ...(deadline ? { deadline: formatDate(deadline) } : {}),
    })
    .where(eq(opportunitiesTable.id, params.data.id))
    .returning();
  await db.insert(auditLogsTable).values({
    actorUserId: actor.id,
    actor: actor.name,
    action: "Opportunity updated",
    target: updated.title,
    details: updated.status,
  });

  res.json(
    UpdateOpportunityResponse.parse({
      ...updated,
      company: existing.company.name,
      companyId: existing.company.id,
      companyLogo: null,
      applicants: 0,
      matchScore: 72,
      verified: existing.company.verified,
    }),
  );
});

router.delete("/opportunities/:id", recruiterOnly, async (req, res): Promise<void> => {
  const actor = actorFrom(res);
  const params = DeleteOpportunityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!isUuid(params.data.id)) {
    res.status(404).json({ error: "Opportunity not found." });
    return;
  }
  const [existing] = await db
    .select()
    .from(opportunitiesTable)
    .where(eq(opportunitiesTable.id, params.data.id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Opportunity not found." });
    return;
  }
  if (existing.recruiterUserId !== actor.id) {
    res.status(403).json({ error: "You can only archive your own opportunities." });
    return;
  }
  await db
    .update(opportunitiesTable)
    .set({ status: "archived" })
    .where(eq(opportunitiesTable.id, params.data.id));
  await db.insert(auditLogsTable).values({
    actorUserId: actor.id,
    actor: actor.name,
    action: "Opportunity archived",
    target: existing.title,
  });
  res.sendStatus(204);
});

router.get("/recruiter/applicants", recruiterOnly, async (req, res): Promise<void> => {
  const query = ListOpportunityApplicantsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const actor = actorFrom(res);
  const [ownedJob] = await db
    .select({ id: opportunitiesTable.id })
    .from(opportunitiesTable)
    .leftJoin(companiesTable, eq(companiesTable.id, opportunitiesTable.companyId))
    .where(
      and(
        eq(opportunitiesTable.id, query.data.opportunityId),
        actor.isDemo
          ? sql`true`
          : or(
              eq(opportunitiesTable.recruiterUserId, actor.id),
              eq(companiesTable.ownerUserId, actor.id),
            ),
      ),
    )
    .limit(1);
  if (!ownedJob) {
    res.status(404).json({ error: "Opportunity not found for this recruiter." });
    return;
  }

  const cacheKey = `recruiter:applicants:${actor.id}:${query.data.opportunityId}:${query.data.stage ?? ""}:${query.data.search ?? ""}`;
  const cached = memoryCache.get<unknown>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const conditions = [eq(applicationsTable.opportunityId, query.data.opportunityId)];
  if (query.data.stage) conditions.push(eq(applicationsTable.stage, query.data.stage));
  if (query.data.search?.trim()) {
    const search = `%${query.data.search.trim()}%`;
    conditions.push(
      or(
        ilike(usersTable.name, search),
        ilike(usersTable.email, search),
        ilike(studentProfilesTable.department, search),
      )!,
    );
  }

  const rows = await db
    .select({
      application: applicationsTable,
      opportunity: opportunitiesTable,
      company: companiesTable,
      student: usersTable,
      profile: studentProfilesTable,
    })
    .from(applicationsTable)
    .innerJoin(opportunitiesTable, eq(opportunitiesTable.id, applicationsTable.opportunityId))
    .innerJoin(companiesTable, eq(companiesTable.id, opportunitiesTable.companyId))
    .innerJoin(usersTable, eq(usersTable.id, applicationsTable.studentUserId))
    .leftJoin(studentProfilesTable, eq(studentProfilesTable.userId, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(applicationsTable.appliedAt));

  const responseData = ListOpportunityApplicantsResponse.parse(
    rows.map(({ application, opportunity, company, student, profile }) => ({
      id: application.id,
      opportunityId: opportunity.id,
      opportunityTitle: opportunity.title,
      company: company.name,
      studentId: student.id,
      studentName: student.name,
      department: profile?.department ?? "Unspecified",
      cgpa: profile?.cgpa ?? 0,
      appliedAt: application.appliedAt,
      stage: application.stage,
      matchScore: application.matchScore,
      resumePath: profile?.resumePath ?? null,
      note: application.note,
    })),
  );

  memoryCache.set(cacheKey, responseData, 120_000);
  res.json(responseData);
});

router.patch("/applications/:id/stage", recruiterOnly, async (req, res): Promise<void> => {
  const actor = actorFrom(res);
  const params = UpdateApplicationStageParams.safeParse(req.params);
  const body = UpdateApplicationStageBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (!isUuid(params.data.id)) {
    res.status(404).json({ error: "Application not found." });
    return;
  }

  const [existing] = await db
    .select({
      application: applicationsTable,
      opportunity: opportunitiesTable,
      company: companiesTable,
      student: usersTable,
      profile: studentProfilesTable,
    })
    .from(applicationsTable)
    .innerJoin(opportunitiesTable, eq(opportunitiesTable.id, applicationsTable.opportunityId))
    .innerJoin(companiesTable, eq(companiesTable.id, opportunitiesTable.companyId))
    .innerJoin(usersTable, eq(usersTable.id, applicationsTable.studentUserId))
    .leftJoin(studentProfilesTable, eq(studentProfilesTable.userId, usersTable.id))
    .where(eq(applicationsTable.id, params.data.id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Application not found." });
    return;
  }
  if (!actor.isDemo && existing.opportunity.recruiterUserId !== actor.id && existing.company.ownerUserId !== actor.id) {
    res.status(403).json({ error: "You can only manage applicants for your own opportunities." });
    return;
  }

  const [application] = await db
    .update(applicationsTable)
    .set({ stage: body.data.stage, note: body.data.note ?? existing.application.note })
    .where(eq(applicationsTable.id, params.data.id))
    .returning();
  await db.insert(notificationsTable).values({
    userId: existing.student.id,
    title: "Application status updated",
    message: `Your application for ${existing.opportunity.title} is now ${body.data.stage.replaceAll("-", " ")}.`,
    type: "application",
  });
  await db.insert(auditLogsTable).values({
    actorUserId: actor.id,
    actor: actor.name,
    action: "Applicant stage changed",
    target: existing.student.name,
    details: `${existing.opportunity.title}: ${body.data.stage}`,
  });

  memoryCache.invalidate("recruiter:applicants");
  memoryCache.invalidate("student:apps");
  memoryCache.invalidate("student:notifs");
  memoryCache.invalidate("dashboard:");
  memoryCache.invalidate("placement:analytics");

  res.json(
    UpdateApplicationStageResponse.parse({
      id: application.id,
      opportunityId: existing.opportunity.id,
      opportunityTitle: existing.opportunity.title,
      company: existing.company.name,
      studentId: existing.student.id,
      studentName: existing.student.name,
      department: existing.profile?.department ?? "Unspecified",
      cgpa: existing.profile?.cgpa ?? 0,
      appliedAt: application.appliedAt,
      stage: application.stage,
      matchScore: application.matchScore,
      resumePath: existing.profile?.resumePath ?? null,
      note: application.note,
    }),
  );
});

router.post("/applications/:id/interviews", recruiterOnly, async (req, res): Promise<void> => {
  const actor = actorFrom(res);
  const params = ScheduleInterviewParams.safeParse(req.params);
  const body = ScheduleInterviewBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: !params.success
        ? params.error.message
        : body.error?.message ?? "Invalid interview details.",
    });
    return;
  }
  if (!isUuid(params.data.id)) {
    res.status(404).json({ error: "Application not found." });
    return;
  }

  const scheduledAt = new Date(body.data.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
    res.status(400).json({ error: "Choose a future interview date and time." });
    return;
  }

  const [existing] = await db
    .select({
      application: applicationsTable,
      opportunity: opportunitiesTable,
      company: companiesTable,
      student: usersTable,
    })
    .from(applicationsTable)
    .innerJoin(opportunitiesTable, eq(opportunitiesTable.id, applicationsTable.opportunityId))
    .innerJoin(companiesTable, eq(companiesTable.id, opportunitiesTable.companyId))
    .innerJoin(usersTable, eq(usersTable.id, applicationsTable.studentUserId))
    .where(eq(applicationsTable.id, params.data.id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Application not found." });
    return;
  }
  if (!actor.isDemo && existing.opportunity.recruiterUserId !== actor.id && existing.company.ownerUserId !== actor.id) {
    res.status(403).json({ error: "You can only schedule interviews for your own applicants." });
    return;
  }

  const [interview] = await db
    .insert(interviewsTable)
    .values({
      applicationId: existing.application.id,
      scheduledAt,
      kind: body.data.kind,
      location: body.data.location,
    })
    .returning();
  await db
    .update(applicationsTable)
    .set({ stage: "interview" })
    .where(eq(applicationsTable.id, existing.application.id));
  await db.insert(notificationsTable).values({
    userId: existing.student.id,
    title: "Interview scheduled",
    message: `${body.data.kind} for ${existing.opportunity.title} is scheduled for ${scheduledAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.`,
    type: "interview",
  });
  await db.insert(auditLogsTable).values({
    actorUserId: actor.id,
    actor: actor.name,
    action: "Interview scheduled",
    target: existing.student.name,
    details: `${existing.opportunity.title}: ${scheduledAt.toISOString()}`,
  });

  res.json(
    ScheduleInterviewResponse.parse({
      id: interview.id,
      opportunityTitle: existing.opportunity.title,
      company: existing.company.name,
      studentName: existing.student.name,
      scheduledAt: interview.scheduledAt,
      kind: interview.kind,
      status: interview.status,
      location: interview.location,
    }),
  );
});

export default router;
