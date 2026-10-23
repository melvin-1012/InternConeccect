import { studentProfilesTable } from "@workspace/db";

export function updateStudentProfileCompletion(
  profile: typeof studentProfilesTable.$inferSelect,
): number {
  const completed = [
    Boolean(profile.department),
    Boolean(profile.degree),
    profile.graduationYear > 0,
    profile.cgpa > 0,
    profile.backlogs >= 0,
    profile.skills.length > 0,
    profile.certifications.length > 0,
    profile.projects.length > 0,
    profile.achievements.length > 0,
    Boolean(profile.github || profile.linkedin || profile.portfolio),
  ].filter(Boolean).length;
  return completed * 10;
}
