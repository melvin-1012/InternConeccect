import { and, desc, eq, notInArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ApplyToOpportunityBody,
  ApplyToOpportunityParams,
  ApplyToOpportunityResponse,
  GetMyProfileResponse,
  ListMyApplicationsResponse,
  ListMyInterviewsResponse,
  ListMyNotificationsResponse,
  ListSavedOpportunitiesResponse,
  MarkNotificationReadParams,
  SaveOpportunityParams,
  UnsaveOpportunityParams,
  UpdateMyProfileBody,
  UpdateMyProfileResponse,
  WithdrawMyApplicationParams,
} from "@workspace/api-zod";
import {
  applicationsTable,
  companiesTable,
  db,
  interviewsTable,
  notificationsTable,
  opportunitiesTable,
  savedOpportunitiesTable,
  studentProfilesTable,
  usersTable,
} from "@workspace/db";
import { requireRole, type AppActor } from "../lib/placementAuth";
import { updateStudentProfileCompletion } from "../lib/placementData";
import { memoryCache } from "../lib/memoryCache";

const router: IRouter = Router();
const studentOnly = requireRole("student");

function actorFrom(res: Parameters<typeof studentOnly>[1]): AppActor {
  return res.locals.actor as AppActor;
}

router.get("/me/profile", studentOnly, async (_req, res): Promise<void> => {
  const actor = actorFrom(res);
  const cacheKey = `student:profile:${actor.id}`;
  const cached = memoryCache.get<unknown>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, actor.id))
    .limit(1);
  const [profile] = await db
    .select()
    .from(studentProfilesTable)
    .where(eq(studentProfilesTable.userId, actor.id))
    .limit(1);

  if (!user || !profile) {
    res.status(404).json({ error: "Student profile not found." });
    return;
  }

  const responseData = GetMyProfileResponse.parse({
    name: user.name,
    email: user.email,
    ...profile,
    id: user.id,
    userId: undefined,
    completion: updateStudentProfileCompletion(profile),
  });

  memoryCache.set(cacheKey, responseData, 120_000);
  res.json(responseData);
});

router.put("/me/profile", studentOnly, async (req, res): Promise<void> => {
  const actor = actorFrom(res);
  const body = UpdateMyProfileBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { name, ...profileValues } = body.data;
  const [user] = await db
    .update(usersTable)
    .set({ name })
    .where(eq(usersTable.id, actor.id))
    .returning();

  const [profile] = await db
    .insert(studentProfilesTable)
    .values({ userId: actor.id, ...profileValues })
    .onConflictDoUpdate({
      target: studentProfilesTable.userId,
      set: profileValues,
    })
    .returning();

  memoryCache.invalidate(`student:profile:${actor.id}`);
  memoryCache.invalidate("placement:students");

  const responseData = UpdateMyProfileResponse.parse({
    name: user.name,
    email: user.email,
    ...profile,
    id: user.id,
    userId: undefined,
    completion: updateStudentProfileCompletion(profile),
  });

  memoryCache.set(`student:profile:${actor.id}`, responseData, 120_000);
  res.json(responseData);
});

router.get("/me/applications", studentOnly, async (_req, res): Promise<void> => {
  const actor = actorFrom(res);
  const cacheKey = `student:apps:${actor.id}`;
  const cached = memoryCache.get<unknown>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
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
    .where(eq(applicationsTable.studentUserId, actor.id))
    .orderBy(desc(applicationsTable.appliedAt));

  const responseData = ListMyApplicationsResponse.parse(
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

router.delete("/me/applications/:id", studentOnly, async (req, res): Promise<void> => {
  const actor = actorFrom(res);
  const params = WithdrawMyApplicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) {
    res.status(404).json({ error: "Application not found." });
    return;
  }

  const [application] = await db
    .select({ id: applicationsTable.id, stage: applicationsTable.stage })
    .from(applicationsTable)
    .where(
      and(
        eq(applicationsTable.id, id),
        eq(applicationsTable.studentUserId, actor.id),
      ),
    )
    .limit(1);
  if (!application) {
    res.status(404).json({ error: "Application not found." });
    return;
  }
  if (application.stage === "selected" || application.stage === "rejected") {
    res.status(409).json({ error: "This application has already reached a final decision." });
    return;
  }

  const [withdrawn] = await db
    .delete(applicationsTable)
    .where(
      and(
        eq(applicationsTable.id, application.id),
        eq(applicationsTable.studentUserId, actor.id),
        notInArray(applicationsTable.stage, ["selected", "rejected"]),
      ),
    )
    .returning({ id: applicationsTable.id });
  if (!withdrawn) {
    res.status(409).json({ error: "This application has already reached a final decision." });
    return;
  }

  memoryCache.invalidate(`student:apps:${actor.id}`);
  memoryCache.invalidate(`dashboard:${actor.id}`);
  memoryCache.invalidate("recruiter:applicants");
  memoryCache.invalidate("placement:analytics");
  memoryCache.invalidate("public:stats");

  res.sendStatus(204);
});

router.post(
  "/opportunities/:id/apply",
  studentOnly,
  async (req, res): Promise<void> => {
    const actor = actorFrom(res);
    const params = ApplyToOpportunityParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const idIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      params.data.id,
    );
    if (!idIsUuid) {
      res.status(404).json({ error: "Opportunity not found." });
      return;
    }

    const body = ApplyToOpportunityBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [opportunity] = await db
      .select({ opportunity: opportunitiesTable, company: companiesTable })
      .from(opportunitiesTable)
      .innerJoin(companiesTable, eq(companiesTable.id, opportunitiesTable.companyId))
      .where(
        and(
          eq(opportunitiesTable.id, params.data.id),
          eq(opportunitiesTable.status, "published"),
        ),
      )
      .limit(1);

    if (!opportunity) {
      res.status(404).json({ error: "This opportunity is no longer open." });
      return;
    }

    const [existing] = await db
      .select({ id: applicationsTable.id })
      .from(applicationsTable)
      .where(
        and(
          eq(applicationsTable.opportunityId, opportunity.opportunity.id),
          eq(applicationsTable.studentUserId, actor.id),
        ),
      )
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "You have already applied to this opportunity." });
      return;
    }

    const [profile] = await db
      .select()
      .from(studentProfilesTable)
      .where(eq(studentProfilesTable.userId, actor.id))
      .limit(1);
    const studentSkills = new Set((profile?.skills ?? []).map((skill) => skill.toLowerCase()));
    const matches = opportunity.opportunity.skills.filter((skill) =>
      studentSkills.has(skill.toLowerCase()),
    ).length;
    const [application] = await db
      .insert(applicationsTable)
      .values({
        opportunityId: opportunity.opportunity.id,
        studentUserId: actor.id,
        stage: "applied",
        matchScore: Math.min(99, 62 + matches * 9),
        note: body.data.note ?? null,
      })
      .returning();

    await db.insert(notificationsTable).values({
      userId: actor.id,
      title: "Application submitted",
      message: `Your application for ${opportunity.opportunity.title} at ${opportunity.company.name} is in.`,
      type: "application",
    });

    memoryCache.invalidate(`student:apps:${actor.id}`);
    memoryCache.invalidate(`dashboard:${actor.id}`);
    memoryCache.invalidate(`student:notifs:${actor.id}`);
    memoryCache.invalidate("recruiter:applicants");
    memoryCache.invalidate("public:opps");
    memoryCache.invalidate("public:stats");

    res.status(201).json(
      ApplyToOpportunityResponse.parse({
        id: application.id,
        opportunityId: opportunity.opportunity.id,
        opportunityTitle: opportunity.opportunity.title,
        company: opportunity.company.name,
        studentId: actor.id,
        studentName: actor.name,
        department: profile?.department ?? "Unspecified",
        cgpa: profile?.cgpa ?? 0,
        appliedAt: application.appliedAt,
        stage: application.stage,
        matchScore: application.matchScore,
        resumePath: profile?.resumePath ?? null,
        note: application.note,
      }),
    );
  },
);

router.get("/me/saved-opportunities", studentOnly, async (_req, res): Promise<void> => {
  const actor = actorFrom(res);
  const cacheKey = `student:saved:${actor.id}`;
  const cached = memoryCache.get<unknown>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const rows = await db
    .select({
      opportunity: opportunitiesTable,
      company: companiesTable,
      savedAt: savedOpportunitiesTable.createdAt,
    })
    .from(savedOpportunitiesTable)
    .innerJoin(opportunitiesTable, eq(opportunitiesTable.id, savedOpportunitiesTable.opportunityId))
    .innerJoin(companiesTable, eq(companiesTable.id, opportunitiesTable.companyId))
    .where(eq(savedOpportunitiesTable.studentUserId, actor.id))
    .orderBy(desc(savedOpportunitiesTable.createdAt));

  const responseData = ListSavedOpportunitiesResponse.parse(
    rows.map(({ opportunity, company }) => ({
      id: opportunity.id,
      title: opportunity.title,
      company: company.name,
      companyId: company.id,
      companyLogo: null,
      location: opportunity.location,
      mode: opportunity.mode,
      type: opportunity.type,
      department: opportunity.department,
      deadline: opportunity.deadline,
      postedAt: opportunity.postedAt,
      status: opportunity.status,
      skills: opportunity.skills,
      description: opportunity.description,
      stipend: opportunity.stipend,
      salary: opportunity.salary,
      duration: opportunity.duration,
      applicants: 0,
      matchScore: 72,
      verified: company.verified,
      eligibility: opportunity.eligibility,
      responsibilities: opportunity.responsibilities,
      requirements: opportunity.requirements,
      benefits: opportunity.benefits,
    })),
  );

  memoryCache.set(cacheKey, responseData, 120_000);
  res.json(responseData);
});

router.put("/me/saved-opportunities/:id", studentOnly, async (req, res): Promise<void> => {
  const actor = actorFrom(res);
  const params = SaveOpportunityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [opportunity] = await db
    .select({ id: opportunitiesTable.id })
    .from(opportunitiesTable)
    .where(eq(opportunitiesTable.id, params.data.id))
    .limit(1);
  if (!opportunity) {
    res.status(404).json({ error: "Opportunity not found." });
    return;
  }

  await db
    .insert(savedOpportunitiesTable)
    .values({ opportunityId: params.data.id, studentUserId: actor.id })
    .onConflictDoNothing();

  memoryCache.invalidate(`student:saved:${actor.id}`);
  res.sendStatus(204);
});

router.delete("/me/saved-opportunities/:id", studentOnly, async (req, res): Promise<void> => {
  const actor = actorFrom(res);
  const params = UnsaveOpportunityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(savedOpportunitiesTable)
    .where(
      and(
        eq(savedOpportunitiesTable.opportunityId, params.data.id),
        eq(savedOpportunitiesTable.studentUserId, actor.id),
      ),
    );

  memoryCache.invalidate(`student:saved:${actor.id}`);
  res.sendStatus(204);
});

router.get("/me/interviews", studentOnly, async (_req, res): Promise<void> => {
  const actor = actorFrom(res);
  const cacheKey = `student:interviews:${actor.id}`;
  const cached = memoryCache.get<unknown>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const rows = await db
    .select({
      interview: interviewsTable,
      opportunity: opportunitiesTable,
      company: companiesTable,
      student: usersTable,
    })
    .from(interviewsTable)
    .innerJoin(applicationsTable, eq(applicationsTable.id, interviewsTable.applicationId))
    .innerJoin(opportunitiesTable, eq(opportunitiesTable.id, applicationsTable.opportunityId))
    .innerJoin(companiesTable, eq(companiesTable.id, opportunitiesTable.companyId))
    .innerJoin(usersTable, eq(usersTable.id, applicationsTable.studentUserId))
    .where(eq(applicationsTable.studentUserId, actor.id))
    .orderBy(interviewsTable.scheduledAt);

  const responseData = ListMyInterviewsResponse.parse(
    rows.map(({ interview, opportunity, company, student }) => ({
      id: interview.id,
      opportunityTitle: opportunity.title,
      company: company.name,
      studentName: student.name,
      scheduledAt: interview.scheduledAt,
      kind: interview.kind,
      status: interview.status,
      location: interview.location,
    })),
  );

  memoryCache.set(cacheKey, responseData, 120_000);
  res.json(responseData);
});

router.get("/me/notifications", studentOnly, async (_req, res): Promise<void> => {
  const actor = actorFrom(res);
  const cacheKey = `student:notifs:${actor.id}`;
  const cached = memoryCache.get<unknown>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const items = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, actor.id))
    .orderBy(desc(notificationsTable.createdAt));

  const responseData = ListMyNotificationsResponse.parse(
    items.map((item) => ({
      id: item.id,
      title: item.title,
      message: item.message,
      createdAt: item.createdAt,
      read: item.read,
      type: item.type,
    })),
  );

  memoryCache.set(cacheKey, responseData, 60_000);
  res.json(responseData);
});

router.patch("/me/notifications/:id/read", studentOnly, async (req, res): Promise<void> => {
  const actor = actorFrom(res);
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(
      and(
        eq(notificationsTable.id, params.data.id),
        eq(notificationsTable.userId, actor.id),
      ),
    );

  memoryCache.invalidate(`student:notifs:${actor.id}`);
  res.sendStatus(204);
});

export default router;
