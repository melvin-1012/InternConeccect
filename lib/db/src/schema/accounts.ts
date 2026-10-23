import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").unique(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull().default("student"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

export const studentProfilesTable = pgTable("student_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  department: text("department").notNull().default("Computer Science"),
  degree: text("degree").notNull().default("B.Tech"),
  graduationYear: integer("graduation_year").notNull().default(2027),
  cgpa: real("cgpa").notNull().default(8),
  backlogs: integer("backlogs").notNull().default(0),
  skills: text("skills").array().notNull().default(sql`ARRAY[]::text[]`),
  certifications: text("certifications").array().notNull().default(sql`ARRAY[]::text[]`),
  projects: text("projects").array().notNull().default(sql`ARRAY[]::text[]`),
  achievements: text("achievements").array().notNull().default(sql`ARRAY[]::text[]`),
  resumePath: text("resume_path"),
  github: text("github").notNull().default(""),
  linkedin: text("linkedin").notNull().default(""),
  portfolio: text("portfolio").notNull().default(""),
  preferences: text("preferences").array().notNull().default(sql`ARRAY[]::text[]`),
});

export const companiesTable = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerUserId: uuid("owner_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  location: text("location").notNull(),
  website: text("website").notNull().default(""),
  description: text("description").notNull().default(""),
  verified: boolean("verified").notNull().default(false),
});
