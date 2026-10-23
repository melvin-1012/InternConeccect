import { sql } from "drizzle-orm";
import {
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companiesTable, usersTable } from "./accounts";

export const opportunitiesTable = pgTable("opportunities", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  recruiterUserId: uuid("recruiter_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  location: text("location").notNull(),
  mode: text("mode").notNull(),
  type: text("type").notNull(),
  department: text("department").notNull(),
  deadline: date("deadline", { mode: "string" }).notNull(),
  postedAt: date("posted_at", { mode: "string" }).notNull().default(sql`CURRENT_DATE`),
  status: text("status").notNull().default("published"),
  skills: text("skills").array().notNull().default(sql`ARRAY[]::text[]`),
  description: text("description").notNull(),
  stipend: integer("stipend").notNull().default(0),
  salary: integer("salary"),
  duration: text("duration"),
  eligibility: text("eligibility").notNull().default("Open to eligible students"),
  responsibilities: text("responsibilities")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  requirements: text("requirements").array().notNull().default(sql`ARRAY[]::text[]`),
  benefits: text("benefits").array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const applicationsTable = pgTable(
  "applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunitiesTable.id, { onDelete: "cascade" }),
    studentUserId: uuid("student_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    stage: text("stage").notNull().default("applied"),
    matchScore: integer("match_score").notNull().default(70),
    note: text("note"),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("application_student_opportunity_idx").on(
      table.opportunityId,
      table.studentUserId,
    ),
  ],
);

export const savedOpportunitiesTable = pgTable(
  "saved_opportunities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunitiesTable.id, { onDelete: "cascade" }),
    studentUserId: uuid("student_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("saved_student_opportunity_idx").on(
      table.opportunityId,
      table.studentUserId,
    ),
  ],
);
