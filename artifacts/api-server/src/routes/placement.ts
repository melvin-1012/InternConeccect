import { and, count, eq, ilike, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreatePlacementDriveBody,
  CreatePlacementDriveResponse,
  GetPlacementAnalyticsResponse,
  ListPlacementCompaniesResponse,
  ListPlacementDrivesResponse,
  ListPlacementStudentsQueryParams,
  ListPlacementStudentsResponse,
  UpdateCompanyVerificationBody,
  UpdateCompanyVerificationParams,
  UpdateCompanyVerificationResponse,
} from "@workspace/api-zod";
import {
  applicationsTable,
  auditLogsTable,
  companiesTable,
  db,
  opportunitiesTable,
  placementDrivesTable,
  studentProfilesTable,
  usersTable,
} from "@workspace/db";
import { requireRole, type AppActor } from "../lib/placementAuth";
import { memoryCache } from "../lib/memoryCache";

const router: IRouter = Router();
const placementOnly = requireRole("placement-officer", "administrator");

function actorFrom(res: { locals: Record<string, unknown> }): AppActor {
  return res.locals.actor as AppActor;
}

router.get("/placement/students", placementOnly, async (req, res): Promise<void> => {
  const query = ListPlacementStudentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const cacheKey = `placement:students:${query.data.department ?? ""}:${query.data.search ?? ""}`;
  const cached = memoryCache.get<unknown>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const conditions = [eq(usersTable.role, "student"), eq(usersTable.status, "active")];
  if (query.data.department) {
    conditions.push(ilike(studentProfilesTable.department, `%${query.data.department}%`));
  }
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
    .select({ user: usersTable, profile: studentProfilesTable })
    .from(usersTable)
    .leftJoin(studentProfilesTable, eq(studentProfilesTable.userId, usersTable.id))
    .where(and(...conditions))
    .orderBy(usersTable.name);

  const responseData = ListPlacementStudentsResponse.parse(
    rows.map(({ user, profile }) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      department: profile?.department ?? "Unspecified",
      degree: profile?.degree ?? "B.Tech",
      graduationYear: profile?.graduationYear ?? 2027,
      cgpa: profile?.cgpa ?? 0,
      backlogs: profile?.backlogs ?? 0,
      skills: profile?.skills ?? [],
      certifications: profile?.certifications ?? [],
      projects: profile?.projects ?? [],
      achievements: profile?.achievements ?? [],
      resumePath: profile?.resumePath ?? null,
      github: profile?.github ?? "",
      linkedin: profile?.linkedin ?? "",
      portfolio: profile?.portfolio ?? "",
      preferences: profile?.preferences ?? [],
      completion: profile
        ? Math.round(
            [
              Boolean(profile.department),
              Boolean(profile.degree),
              profile.graduationYear > 0,
              profile.cgpa > 0,
              profile.skills.length > 0,
              profile.projects.length > 0,
              Boolean(profile.github || profile.linkedin || profile.portfolio),
            ].filter(Boolean).length * (100 / 7),
          )
        : 0,
    })),
  );

  memoryCache.set(cacheKey, responseData, 120_000);
  res.json(responseData);
});

router.get("/placement/companies", placementOnly, async (_req, res): Promise<void> => {
  const cacheKey = "placement:companies";
  const cached = memoryCache.get<unknown>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const companies = await db
    .select({
      company: companiesTable,
      openRoles: count(opportunitiesTable.id),
    })
    .from(companiesTable)
    .leftJoin(
      opportunitiesTable,
      and(
        eq(opportunitiesTable.companyId, companiesTable.id),
        eq(opportunitiesTable.status, "published"),
      ),
    )
    .groupBy(companiesTable.id)
    .orderBy(companiesTable.name);

  const responseData = ListPlacementCompaniesResponse.parse(
    companies.map(({ company, openRoles }) => ({
      id: company.id,
      name: company.name,
      industry: company.industry,
      location: company.location,
      website: company.website,
      description: company.description,
      verified: company.verified,
      openRoles: Number(openRoles),
    })),
  );

  memoryCache.set(cacheKey, responseData, 120_000);
  res.json(responseData);
});

router.patch("/placement/companies/:id/verification", placementOnly, async (req, res): Promise<void> => {
  const actor = actorFrom(res);
  const params = UpdateCompanyVerificationParams.safeParse(req.params);
  const body = UpdateCompanyVerificationBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: !params.success
        ? params.error.message
        : body.error?.message ?? "Invalid verification update.",
    });
    return;
  }

  const [company] = await db
    .update(companiesTable)
    .set({ verified: body.data.verified })
    .where(eq(companiesTable.id, params.data.id))
    .returning();
  if (!company) {
    res.status(404).json({ error: "Company not found." });
    return;
  }

  const [openRoleResult] = await db
    .select({ total: count(opportunitiesTable.id) })
    .from(opportunitiesTable)
    .where(
      and(
        eq(opportunitiesTable.companyId, company.id),
        eq(opportunitiesTable.status, "published"),
      ),
    );
  await db.insert(auditLogsTable).values({
    actorUserId: actor.id,
    actor: actor.name,
    action: body.data.verified ? "Company verified" : "Company verification revoked",
    target: company.name,
  });

  memoryCache.invalidate("placement:companies");
  memoryCache.invalidate("placement:analytics");
  memoryCache.invalidate("public:opps");
  memoryCache.invalidate("public:stats");

  res.json(
    UpdateCompanyVerificationResponse.parse({
      id: company.id,
      name: company.name,
      industry: company.industry,
      location: company.location,
      website: company.website,
      description: company.description,
      verified: company.verified,
      openRoles: Number(openRoleResult?.total ?? 0),
    }),
  );
});

router.get("/placement/drives", placementOnly, async (_req, res): Promise<void> => {
  const cacheKey = "placement:drives";
  const cached = memoryCache.get<unknown>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const rows = await db
    .select({
      drive: placementDrivesTable,
      company: companiesTable,
    })
    .from(placementDrivesTable)
    .innerJoin(companiesTable, eq(companiesTable.id, placementDrivesTable.companyId))
    .orderBy(placementDrivesTable.date);

  const responseData = ListPlacementDrivesResponse.parse(
    rows.map(({ drive, company }) => ({
      id: drive.id,
      company: company.name,
      title: drive.title,
      date: drive.date,
      location: drive.location,
      status: drive.status,
      opportunityId: drive.opportunityId,
    })),
  );

  memoryCache.set(cacheKey, responseData, 120_000);
  res.json(responseData);
});

router.post("/placement/drives", placementOnly, async (req, res): Promise<void> => {
  const actor = actorFrom(res);
  const body = CreatePlacementDriveBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [opportunity] = await db
    .select()
    .from(opportunitiesTable)
    .where(eq(opportunitiesTable.id, body.data.opportunityId))
    .limit(1);
  if (!opportunity) {
    res.status(404).json({ error: "Opportunity not found." });
    return;
  }
  const [company] = await db
    .select({ id: companiesTable.id, name: companiesTable.name })
    .from(companiesTable)
    .where(eq(companiesTable.id, opportunity.companyId))
    .limit(1);
  if (body.data.company.trim().toLowerCase() !== company.name.trim().toLowerCase()) {
    res.status(400).json({ error: "Company must match the selected opportunity." });
    return;
  }
  const [drive] = await db
    .insert(placementDrivesTable)
    .values({
      companyId: opportunity.companyId,
      opportunityId: opportunity.id,
      title: body.data.title,
      date: body.data.date.toISOString().slice(0, 10),
      location: body.data.location,
    })
    .returning();
  await db.insert(auditLogsTable).values({
    actorUserId: actor.id,
    actor: actor.name,
    action: "Placement drive scheduled",
    target: drive.title,
    details: drive.date,
  });

  memoryCache.invalidate("placement:drives");
  memoryCache.invalidate("placement:analytics");

  res.status(201).json(
    CreatePlacementDriveResponse.parse({
      id: drive.id,
      company: company.name,
      title: drive.title,
      date: drive.date,
      location: drive.location,
      status: drive.status,
      opportunityId: drive.opportunityId,
    }),
  );
});

router.get("/placement/analytics", placementOnly, async (_req, res): Promise<void> => {
  const cacheKey = "placement:analytics";
  const cached = memoryCache.get<unknown>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const departmentCounts = await db
    .select({
      label: studentProfilesTable.department,
      value: count(studentProfilesTable.id),
    })
    .from(studentProfilesTable)
    .groupBy(studentProfilesTable.department)
    .orderBy(studentProfilesTable.department);
  const stages = await db
    .select({ label: applicationsTable.stage, value: count(applicationsTable.id) })
    .from(applicationsTable)
    .groupBy(applicationsTable.stage)
    .orderBy(applicationsTable.stage);
  const selectedPackages = await db
    .select({ salary: opportunitiesTable.salary })
    .from(applicationsTable)
    .innerJoin(opportunitiesTable, eq(opportunitiesTable.id, applicationsTable.opportunityId))
    .where(
      and(
        eq(applicationsTable.stage, "selected"),
        sql`${opportunitiesTable.salary} IS NOT NULL`,
      ),
    );
  const packageBands = new Map<string, number>([
    ["< ₹8L", 0],
    ["₹8–12L", 0],
    ["₹12–16L", 0],
    ["₹16L+", 0],
  ]);
  for (const item of selectedPackages) {
    const salary = item.salary ?? 0;
    const band =
      salary < 800000
        ? "< ₹8L"
        : salary < 1200000
          ? "₹8–12L"
          : salary < 1600000
            ? "₹12–16L"
            : "₹16L+";
    packageBands.set(band, (packageBands.get(band) ?? 0) + 1);
  }

  const responseData = GetPlacementAnalyticsResponse.parse({
    departments: departmentCounts.map((item) => ({
      label: item.label,
      value: Number(item.value),
    })),
    packages: Array.from(packageBands, ([label, value]) => ({ label, value })),
    outcomes: stages.map((item) => ({
      label: item.label.replaceAll("-", " "),
      value: Number(item.value),
    })),
    sampleData: true,
  });

  memoryCache.set(cacheKey, responseData, 120_000);
  res.json(responseData);
});

export default router;
