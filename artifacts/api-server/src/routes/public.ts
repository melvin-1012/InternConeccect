import { and, count, eq, ilike, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetOpportunityParams,
  GetOpportunityResponse,
  GetPublicStatsResponse,
  ListOpportunitiesQueryParams,
  ListOpportunitiesResponse,
} from "@workspace/api-zod";
import {
  applicationsTable,
  companiesTable,
  db,
  opportunitiesTable,
  studentProfilesTable,
} from "@workspace/db";
import { resolveActor } from "../lib/placementAuth";

const router: IRouter = Router();

function mapOpportunity(
  row: {
    opportunity: typeof opportunitiesTable.$inferSelect;
    company: typeof companiesTable.$inferSelect;
    applicants: number;
  },
  profile?: typeof studentProfilesTable.$inferSelect,
) {
  const jobSkills = row.opportunity.skills.map((skill) => skill.toLowerCase());
  const studentSkills = new Set((profile?.skills ?? []).map((skill) => skill.toLowerCase()));
  const sharedSkills = jobSkills.filter((skill) => studentSkills.has(skill)).length;
  const matchScore = profile
    ? Math.min(99, Math.max(55, 62 + sharedSkills * 9))
    : 72;

  return {
    id: row.opportunity.id,
    title: row.opportunity.title,
    company: row.company.name,
    companyId: row.company.id,
    companyLogo: null,
    location: row.opportunity.location,
    mode: row.opportunity.mode,
    type: row.opportunity.type,
    department: row.opportunity.department,
    deadline: row.opportunity.deadline,
    postedAt: row.opportunity.postedAt,
    status: row.opportunity.status,
    skills: row.opportunity.skills,
    description: row.opportunity.description,
    stipend: row.opportunity.stipend,
    salary: row.opportunity.salary,
    duration: row.opportunity.duration,
    applicants: Number(row.applicants),
    matchScore,
    verified: row.company.verified,
    eligibility: row.opportunity.eligibility,
    responsibilities: row.opportunity.responsibilities,
    requirements: row.opportunity.requirements,
    benefits: row.opportunity.benefits,
  };
}

router.get("/public/stats", async (_req, res): Promise<void> => {
  const [students] = await db
    .select({ value: count() })
    .from(studentProfilesTable);
  const [companies] = await db.select({ value: count() }).from(companiesTable);
  const [placements] = await db
    .select({ value: count() })
    .from(applicationsTable)
    .where(eq(applicationsTable.stage, "selected"));
  const [internships] = await db
    .select({ value: count() })
    .from(opportunitiesTable)
    .where(and(eq(opportunitiesTable.type, "internship"), eq(opportunitiesTable.status, "published")));

  res.json(
    GetPublicStatsResponse.parse({
      students: Number(students.value),
      companies: Number(companies.value),
      placements: Number(placements.value),
      internships: Number(internships.value),
      sampleData: true,
    }),
  );
});

router.get("/opportunities", async (req, res): Promise<void> => {
  const parsed = ListOpportunitiesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const filters = parsed.data;
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 12;
  const actor = await resolveActor(req);
  const conditions =
    actor?.role === "recruiter"
      ? [eq(opportunitiesTable.recruiterUserId, actor.id)]
      : [eq(opportunitiesTable.status, "published")];

  if (filters.type) conditions.push(eq(opportunitiesTable.type, filters.type));
  if (filters.mode) conditions.push(eq(opportunitiesTable.mode, filters.mode));
  if (filters.department) {
    conditions.push(ilike(opportunitiesTable.department, `%${filters.department}%`));
  }
  if (filters.location) {
    conditions.push(ilike(opportunitiesTable.location, `%${filters.location}%`));
  }
  if (filters.search?.trim()) {
    const search = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(opportunitiesTable.title, search),
        ilike(opportunitiesTable.description, search),
        sql`${opportunitiesTable.skills}::text ILIKE ${search}`,
        ilike(companiesTable.name, search),
      )!,
    );
  }

  const where = and(...conditions);
  const order = filters.sort === "deadline"
    ? [opportunitiesTable.deadline]
    : filters.sort === "stipend"
      ? [sql`${opportunitiesTable.stipend} DESC`]
      : [sql`${opportunitiesTable.postedAt} DESC`, opportunitiesTable.title];

  const rows = await db
    .select({
      opportunity: opportunitiesTable,
      company: companiesTable,
      applicants: count(applicationsTable.id),
    })
    .from(opportunitiesTable)
    .innerJoin(companiesTable, eq(companiesTable.id, opportunitiesTable.companyId))
    .leftJoin(applicationsTable, eq(applicationsTable.opportunityId, opportunitiesTable.id))
    .where(where)
    .groupBy(opportunitiesTable.id, companiesTable.id)
    .orderBy(...order)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [totalRow] = await db
    .select({ value: count() })
    .from(opportunitiesTable)
    .innerJoin(companiesTable, eq(companiesTable.id, opportunitiesTable.companyId))
    .where(where);

  let profile: typeof studentProfilesTable.$inferSelect | undefined;
  if (actor?.role === "student") {
    [profile] = await db
      .select()
      .from(studentProfilesTable)
      .where(eq(studentProfilesTable.userId, actor.id))
      .limit(1);
  }

  res.json(
    ListOpportunitiesResponse.parse({
      items: rows.map((row) => mapOpportunity(row, profile)),
      total: Number(totalRow.value),
      page,
      pageSize,
    }),
  );
});

router.get("/opportunities/:id", async (req, res): Promise<void> => {
  const params = GetOpportunityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select({
      opportunity: opportunitiesTable,
      company: companiesTable,
      applicants: count(applicationsTable.id),
    })
    .from(opportunitiesTable)
    .innerJoin(companiesTable, eq(companiesTable.id, opportunitiesTable.companyId))
    .leftJoin(applicationsTable, eq(applicationsTable.opportunityId, opportunitiesTable.id))
    .where(eq(opportunitiesTable.id, params.data.id))
    .groupBy(opportunitiesTable.id, companiesTable.id)
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Opportunity not found." });
    return;
  }

  const actor = await resolveActor(req);
  if (
    row.opportunity.status !== "published" &&
    !(actor?.role === "recruiter" && actor.id === row.opportunity.recruiterUserId)
  ) {
    res.status(404).json({ error: "Opportunity not found." });
    return;
  }
  const [profile] = actor?.role === "student"
    ? await db
        .select()
        .from(studentProfilesTable)
        .where(eq(studentProfilesTable.userId, actor.id))
        .limit(1)
    : [];

  res.json(GetOpportunityResponse.parse(mapOpportunity(row, profile)));
});

export default router;
