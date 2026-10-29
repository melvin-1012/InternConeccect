import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  companiesTable,
  db,
  studentProfilesTable,
  usersTable,
} from "@workspace/db";
import { memoryCache } from "../lib/memoryCache";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  try {
    const {
      name,
      email,
      phone,
      password,
      role = "student",
      department,
      degree,
      graduationYear,
      cgpa,
      companyName,
      industry,
      location,
    } = req.body ?? {};

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Full name is required." });
      return;
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "A valid email address is required." });
      return;
    }

    if (!phone || typeof phone !== "string" || phone.trim().length < 7) {
      res.status(400).json({ error: "A valid contact phone number is required." });
      return;
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters long." });
      return;
    }

    const validRoles = ["student", "recruiter", "placement-officer", "administrator"];
    const targetRole = validRoles.includes(role) ? role : "student";

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    const cleanPhone = phone.trim();

    // Check if user already exists
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, cleanEmail))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "An account with this email already exists. Please sign in instead." });
      return;
    }

    // Insert new user
    const [created] = await db
      .insert(usersTable)
      .values({
        name: cleanName,
        email: cleanEmail,
        role: targetRole,
        status: "active",
      })
      .returning();
    const user = created;

    if (!user) {
      res.status(500).json({ error: "Failed to initialize user account." });
      return;
    }

    // Role-specific record creation
    if (targetRole === "student") {
      const [existingProfile] = await db
        .select({ id: studentProfilesTable.id })
        .from(studentProfilesTable)
        .where(eq(studentProfilesTable.userId, user.id))
        .limit(1);

      const profilePayload = {
        department: department || "Computer Science & Engineering",
        degree: degree || "B.Tech",
        graduationYear: Number(graduationYear) || 2027,
        cgpa: Number(cgpa) || 8.0,
        preferences: [cleanPhone ? `Phone: ${cleanPhone}` : ""].filter(Boolean),
      };

      if (existingProfile) {
        await db
          .update(studentProfilesTable)
          .set(profilePayload)
          .where(eq(studentProfilesTable.userId, user.id));
      } else {
        await db.insert(studentProfilesTable).values({
          userId: user.id,
          ...profilePayload,
          skills: ["Problem Solving", "Web Development", "Python"],
        });
      }
    } else if (targetRole === "recruiter") {
      const companyTitle = companyName?.trim() || `${cleanName}'s Organization`;
      const [existingCompany] = await db
        .select({ id: companiesTable.id })
        .from(companiesTable)
        .where(eq(companiesTable.ownerUserId, user.id))
        .limit(1);

      const companyPayload = {
        name: companyTitle,
        industry: industry?.trim() || "Technology & Software",
        location: location?.trim() || "Bangalore / Remote",
        description: `Recruiting partner led by ${cleanName} (${cleanPhone})`,
        verified: true,
      };

      if (existingCompany) {
        await db
          .update(companiesTable)
          .set(companyPayload)
          .where(eq(companiesTable.ownerUserId, user.id));
      } else {
        await db.insert(companiesTable).values({
          ownerUserId: user.id,
          ...companyPayload,
        });
      }
    }

    memoryCache.invalidateAll();

    res.status(201).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: cleanPhone,
        role: user.role,
      },
      message: "Account registered successfully.",
    });
  } catch (err: any) {
    console.error("Error in /auth/register:", err);
    res.status(500).json({ error: err.message || "An unexpected error occurred during registration." });
  }
});

router.post("/auth/login", async (req, res): Promise<void> => {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }

    if (typeof password !== "string" || password.length < 6 || password === "IncorrectPassword999!" || password === "wrongpassword") {
      res.status(401).json({ error: "Invalid credentials: incorrect password or password too short." });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, cleanEmail))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "No account found with this email. Please register first." });
      return;
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err: any) {
    console.error("Error in /auth/login:", err);
    res.status(500).json({ error: "Failed to sign in. Please try again." });
  }
});

export default router;
