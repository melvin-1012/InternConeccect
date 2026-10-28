import { getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, studentProfilesTable, usersTable, companiesTable } from "@workspace/db";

export const appRoles = [
  "student",
  "recruiter",
  "placement-officer",
  "administrator",
] as const;

export type AppRole = (typeof appRoles)[number];

export type AppActor = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  isDemo: boolean;
};

const demoAccounts: Record<AppRole, { email: string; name: string }> = {
  student: {
    email: "student.01@internconnect.demo",
    name: "Alex Morgan",
  },
  recruiter: {
    email: "recruiter.01@internconnect.demo",
    name: "Rachel Green",
  },
  "placement-officer": {
    email: "placement@internconnect.demo",
    name: "Dr. Patrick Owens",
  },
  administrator: {
    email: "admin@internconnect.demo",
    name: "Admin Director",
  },
};

// In-memory caches to make authentication & page navigation instantaneous
const demoActorCache = new Map<AppRole, { actor: AppActor; expiresAt: number }>();
const clerkActorCache = new Map<string, { actor: AppActor; expiresAt: number }>();

const CACHE_TTL_MS = 120_000; // 2 minutes

async function resolveDemoActor(role: AppRole): Promise<AppActor | null> {
  const cached = demoActorCache.get(role);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.actor;
  }

  const account = demoAccounts[role];
  if (!account) return null;

  try {
    let [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, account.email))
      .limit(1);

    if (!user) {
      const [created] = await db
        .insert(usersTable)
        .values({
          name: account.name,
          email: account.email,
          role,
          status: "active",
        })
        .onConflictDoUpdate({
          target: usersTable.email,
          set: { role, status: "active", name: account.name },
        })
        .returning();
      user = created;
    }

    if (!user) return null;

    if (role === "student") {
      const [profile] = await db
        .select({ id: studentProfilesTable.id })
        .from(studentProfilesTable)
        .where(eq(studentProfilesTable.userId, user.id))
        .limit(1);

      if (!profile) {
        await db
          .insert(studentProfilesTable)
          .values({
            userId: user.id,
            department: "Computer Science & Engineering",
            degree: "B.Tech",
            graduationYear: 2027,
            cgpa: 8.9,
            backlogs: 0,
            skills: ["TypeScript", "React", "Node.js", "Python", "SQL", "Docker"],
            certifications: ["AWS Certified Cloud Practitioner", "PostgreSQL Certified Developer"],
            projects: ["Campus Placement Portal", "Distributed Task Queue", "Realtime Code Collaborator"],
            achievements: ["Dean's Honor List 2025", "Hackathon 1st Runner Up"],
            github: "https://github.com/alexmorgan-demo",
            linkedin: "https://linkedin.com/in/alexmorgan-demo",
            portfolio: "https://alexmorgan.dev",
            preferences: ["Software Engineer", "Full Stack Developer", "Backend Engineer"],
          })
          .onConflictDoNothing();
      }
    }

    if (role === "recruiter") {
      const [company] = await db
        .select({ id: companiesTable.id })
        .from(companiesTable)
        .where(eq(companiesTable.ownerUserId, user.id))
        .limit(1);

      if (!company) {
        await db
          .insert(companiesTable)
          .values({
            ownerUserId: user.id,
            name: "Nexus Technologies",
            industry: "Enterprise Software & Cloud",
            location: "San Francisco, CA / Bangalore",
            website: "https://nexus-technologies.demo",
            description: "Nexus Technologies builds high-throughput, mission-critical cloud native data infrastructure for modern engineering teams worldwide.",
            verified: true,
          })
          .onConflictDoNothing();
      }
    }

    const actor: AppActor = {
      id: user.id,
      name: user.name,
      email: user.email,
      role,
      isDemo: true,
    };

    demoActorCache.set(role, { actor, expiresAt: Date.now() + CACHE_TTL_MS });
    return actor;
  } catch (err) {
    console.error("Error resolving demo actor:", err);
    return null;
  }
}

export async function resolveActor(req: Request): Promise<AppActor | null> {
  let clerkUserId: string | null = null;
  let claims: Record<string, unknown> | null = null;
  try {
    const auth = getAuth(req);
    clerkUserId = auth.userId;
    claims = auth.sessionClaims as Record<string, unknown> | null;
  } catch {
    // Clerk not configured or session invalid
  }

  const demoRole = req.get("x-demo-role");
  if (
    !clerkUserId &&
    (process.env.NODE_ENV === "development" || !process.env.NODE_ENV) &&
    demoRole &&
    (appRoles as readonly string[]).includes(demoRole)
  ) {
    return resolveDemoActor(demoRole as AppRole);
  }

  if (!clerkUserId) return null;

  const cached = clerkActorCache.get(clerkUserId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.actor;
  }

  const [existingUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);

  if (existingUser) {
    const actor: AppActor = {
      id: existingUser.id,
      name: existingUser.name,
      email: existingUser.email,
      role: appRoles.includes(existingUser.role as AppRole)
        ? (existingUser.role as AppRole)
        : "student",
      isDemo: false,
    };
    clerkActorCache.set(clerkUserId, { actor, expiresAt: Date.now() + CACHE_TTL_MS });
    return actor;
  }

  const claimEmail =
    typeof claims?.email === "string" ? claims.email : `member.${clerkUserId}@accounts.internconnect.demo`;
  const claimName =
    typeof claims?.name === "string"
      ? claims.name
      : claimEmail.split("@")[0].replace(/[._-]/g, " ");

  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId,
      name: claimName,
      email: claimEmail,
      role: "student",
      status: "active",
    })
    .onConflictDoUpdate({
      target: usersTable.clerkUserId,
      set: { name: claimName, email: claimEmail },
    })
    .returning();

  await db
    .insert(studentProfilesTable)
    .values({ userId: user.id })
    .onConflictDoNothing();

  const actor: AppActor = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: "student",
    isDemo: false,
  };

  clerkActorCache.set(clerkUserId, { actor, expiresAt: Date.now() + CACHE_TTL_MS });
  return actor;
}

export function requireRole(...allowedRoles: AppRole[]): RequestHandler {
  return async (req, res, next): Promise<void> => {
    const actor = await resolveActor(req);
    if (!actor) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }

    if (!allowedRoles.includes(actor.role)) {
      res.status(403).json({ error: "Your account does not have permission for this action." });
      return;
    }

    res.locals.actor = actor;
    next();
  };
}
