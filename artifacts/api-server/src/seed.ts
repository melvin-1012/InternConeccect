import { eq, sql } from "drizzle-orm";
import {
  applicationsTable,
  auditLogsTable,
  companiesTable,
  db,
  interviewsTable,
  notificationsTable,
  opportunitiesTable,
  placementDrivesTable,
  savedOpportunitiesTable,
  studentProfilesTable,
  usersTable,
} from "@workspace/db";

export async function ensureSeedData(): Promise<void> {
  console.log("Checking and ensuring initial seed data in database...");

  // 1. Seed or ensure demo users
  const demoUsersConfig = [
    {
      email: "student.01@internconnect.demo",
      name: "Alex Morgan",
      role: "student",
    },
    {
      email: "recruiter.01@internconnect.demo",
      name: "Rachel Green",
      role: "recruiter",
    },
    {
      email: "placement@internconnect.demo",
      name: "Dr. Patrick Owens",
      role: "placement-officer",
    },
    {
      email: "admin@internconnect.demo",
      name: "Admin Director",
      role: "administrator",
    },
    {
      email: "sarah.chen@internconnect.demo",
      name: "Sarah Chen",
      role: "student",
    },
    {
      email: "rohan.gupta@internconnect.demo",
      name: "Rohan Gupta",
      role: "student",
    },
  ];

  const seededUsers: Record<string, typeof usersTable.$inferSelect> = {};

  for (const u of demoUsersConfig) {
    let [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, u.email))
      .limit(1);

    if (!existing) {
      const [inserted] = await db
        .insert(usersTable)
        .values({
          name: u.name,
          email: u.email,
          role: u.role,
          status: "active",
        })
        .onConflictDoUpdate({
          target: usersTable.email,
          set: { role: u.role, status: "active", name: u.name },
        })
        .returning();
      existing = inserted;
    }
    seededUsers[u.email] = existing;
  }

  const alex = seededUsers["student.01@internconnect.demo"];
  const rachel = seededUsers["recruiter.01@internconnect.demo"];
  const patrick = seededUsers["placement@internconnect.demo"];
  const admin = seededUsers["admin@internconnect.demo"];
  const sarah = seededUsers["sarah.chen@internconnect.demo"];
  const rohan = seededUsers["rohan.gupta@internconnect.demo"];

  // 2. Ensure Student Profiles
  if (alex) {
    const [alexProf] = await db
      .select({ id: studentProfilesTable.id })
      .from(studentProfilesTable)
      .where(eq(studentProfilesTable.userId, alex.id))
      .limit(1);

    if (!alexProf) {
      await db.insert(studentProfilesTable).values({
        userId: alex.id,
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
      }).onConflictDoNothing();
    }
  }

  if (sarah) {
    const [sarahProf] = await db
      .select({ id: studentProfilesTable.id })
      .from(studentProfilesTable)
      .where(eq(studentProfilesTable.userId, sarah.id))
      .limit(1);

    if (!sarahProf) {
      await db.insert(studentProfilesTable).values({
        userId: sarah.id,
        department: "Information Science",
        degree: "B.Tech",
        graduationYear: 2027,
        cgpa: 9.3,
        backlogs: 0,
        skills: ["React", "TypeScript", "Next.js", "TailwindCSS", "GraphQL"],
        certifications: ["Meta Frontend Professional"],
        projects: ["Design System Library", "Student Mentorship App"],
        achievements: ["Academic Excellence Award"],
        preferences: ["Frontend Engineer", "UI/UX Developer"],
      }).onConflictDoNothing();
    }
  }

  if (rohan) {
    const [rohanProf] = await db
      .select({ id: studentProfilesTable.id })
      .from(studentProfilesTable)
      .where(eq(studentProfilesTable.userId, rohan.id))
      .limit(1);

    if (!rohanProf) {
      await db.insert(studentProfilesTable).values({
        userId: rohan.id,
        department: "Electronics & Communication",
        degree: "B.Tech",
        graduationYear: 2027,
        cgpa: 8.4,
        backlogs: 0,
        skills: ["Python", "C++", "Embedded Systems", "IoT", "Linux"],
        certifications: ["Certified Embedded Systems Engineer"],
        projects: ["Smart Campus Energy Monitor"],
        preferences: ["Systems Engineer", "Firmware Engineer"],
      }).onConflictDoNothing();
    }
  }

  // 3. Ensure Companies
  let [nexus] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.name, "Nexus Technologies"))
    .limit(1);

  if (!nexus) {
    const [createdNexus] = await db
      .insert(companiesTable)
      .values({
        ownerUserId: rachel?.id,
        name: "Nexus Technologies",
        industry: "Enterprise Software & Cloud",
        location: "San Francisco, CA / Bangalore",
        website: "https://nexus-technologies.demo",
        description: "Nexus Technologies builds high-throughput, mission-critical cloud native data infrastructure for modern engineering teams worldwide.",
        verified: true,
      })
      .returning();
    nexus = createdNexus;
  } else if (!nexus.ownerUserId && rachel) {
    await db
      .update(companiesTable)
      .set({ ownerUserId: rachel.id })
      .where(eq(companiesTable.id, nexus.id));
  }

  let [apex] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.name, "Apex Financial Systems"))
    .limit(1);

  if (!apex) {
    const [createdApex] = await db
      .insert(companiesTable)
      .values({
        name: "Apex Financial Systems",
        industry: "FinTech & Banking",
        location: "Mumbai / Onsite",
        website: "https://apex-fintech.demo",
        description: "Apex Financial Systems provides ultra-low latency exchange trading infra and modern financial settlement rails.",
        verified: true,
      })
      .returning();
    apex = createdApex;
  }

  let [starlight] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.name, "Starlight AI Labs"))
    .limit(1);

  if (!starlight) {
    const [createdStarlight] = await db
      .insert(companiesTable)
      .values({
        name: "Starlight AI Labs",
        industry: "Artificial Intelligence",
        location: "Remote / Hybrid",
        website: "https://starlight-ai.demo",
        description: "Pioneering frontier foundation models, autonomous agents, and enterprise AI orchestration.",
        verified: true,
      })
      .returning();
    starlight = createdStarlight;
  }

  let [quantum] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.name, "Quantum BioHealth"))
    .limit(1);

  if (!quantum) {
    const [createdQuantum] = await db
      .insert(companiesTable)
      .values({
        name: "Quantum BioHealth",
        industry: "HealthTech & Bio",
        location: "Hyderabad / Onsite",
        website: "https://quantumbio.demo",
        description: "Empowering breakthrough therapeutic discovery with genomics computation and high-dimensional health data pipelines.",
        verified: true,
      })
      .returning();
    quantum = createdQuantum;
  }

  // 4. Ensure Opportunities
  const [existingOppCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunitiesTable);

  if (!existingOppCount || existingOppCount.count === 0) {
    console.log("Seeding realistic internship and job opportunities...");

    const [oppNexus1] = await db
      .insert(opportunitiesTable)
      .values({
        companyId: nexus.id,
        recruiterUserId: rachel?.id,
        title: "Software Engineering Intern",
        location: "Bangalore, India",
        mode: "hybrid",
        type: "internship",
        department: "Computer Science",
        deadline: "2026-12-31",
        postedAt: "2026-10-01",
        status: "published",
        stipend: 45000,
        duration: "6 Months",
        skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker"],
        description: "Join our Core Platform Engineering group to build high-scale distributed backend systems and delightful developer dashboards. You will write production TypeScript/Node.js microservices, optimize SQL queries, and collaborate closely with senior engineers.",
        eligibility: "Open to B.Tech/M.Tech Computer Science & IT students (2027 batch). Minimum 7.5 CGPA with no standing backlogs.",
        responsibilities: [
          "Develop and test RESTful and streaming APIs for cloud-native orchestration.",
          "Partner with frontend engineers to ship responsive user experiences.",
          "Participate in design discussions and peer code reviews.",
          "Write clean, maintainable, thoroughly tested code.",
        ],
        requirements: [
          "Proficiency in TypeScript, JavaScript, or modern Python.",
          "Solid foundational understanding of data structures, algorithms, and SQL.",
          "Hands-on familiarity with Git and Linux environments.",
        ],
        benefits: [
          "Monthly stipend of ₹45,000.",
          "Pre-Placement Offer (PPO) opportunity upon internship completion.",
          "Comprehensive health insurance and meal allowances.",
          "Flexible hybrid working model and modern Mac workstation.",
        ],
      })
      .returning();

    const [oppNexus2] = await db
      .insert(opportunitiesTable)
      .values({
        companyId: nexus.id,
        recruiterUserId: rachel?.id,
        title: "Full Stack Developer Intern",
        location: "Bangalore, India",
        mode: "onsite",
        type: "internship",
        department: "Computer Science",
        deadline: "2026-11-30",
        postedAt: "2026-10-05",
        status: "published",
        stipend: 40000,
        duration: "6 Months",
        skills: ["React", "TypeScript", "TailwindCSS", "REST APIs", "Node.js"],
        description: "Design and implement modern, accessible user interfaces and robust APIs for our cloud telemetry tools.",
        eligibility: "Open to 2027 graduating engineers with strong frontend/full stack experience.",
        responsibilities: [
          "Build intuitive UI components using React, TailwindCSS, and TanStack Query.",
          "Integrate frontend workflows with internal APIs and databases.",
        ],
        requirements: [
          "Strong command of HTML5, CSS3, modern JavaScript, and React.",
          "Eye for design details and micro-interactions.",
        ],
        benefits: ["Competitive monthly stipend", "Mentorship from staff engineers"],
      })
      .returning();

    const [oppApex] = await db
      .insert(opportunitiesTable)
      .values({
        companyId: apex.id,
        title: "Cloud Infrastructure & SRE Intern",
        location: "Mumbai, India",
        mode: "hybrid",
        type: "internship",
        department: "DevOps / SRE",
        deadline: "2026-12-15",
        postedAt: "2026-10-10",
        status: "published",
        stipend: 50000,
        duration: "6 Months",
        skills: ["Kubernetes", "AWS", "Docker", "Python", "Linux"],
        description: "Work on mission-critical financial exchange infrastructure, automated failover pipelines, and zero-trust cloud security.",
        eligibility: "Open to all engineering streams. Strong Linux and scripting fundamentals required.",
        responsibilities: [
          "Automate cloud deployments with Terraform and Kubernetes.",
          "Build monitoring alerts and telemetry dashboards using Prometheus and Grafana.",
        ],
        requirements: ["Proficiency in Python/Bash scripting and Linux administration."],
        benefits: ["₹50,000 monthly stipend", "High-frequency trading architecture exposure"],
      })
      .returning();

    const [oppStarlight] = await db
      .insert(opportunitiesTable)
      .values({
        companyId: starlight.id,
        title: "AI Research Engineer Intern",
        location: "Remote",
        mode: "remote",
        type: "internship",
        department: "Artificial Intelligence",
        deadline: "2027-01-15",
        postedAt: "2026-10-12",
        status: "published",
        stipend: 60000,
        duration: "6 Months",
        skills: ["Python", "PyTorch", "Transformers", "NLP", "LLMs"],
        description: "Collaborate with research scientists on fine-tuning, evaluating, and serving state-of-the-art multimodal reasoning models.",
        eligibility: "Open to students with proven machine learning coursework or projects.",
        responsibilities: [
          "Train and evaluate transformer checkpoints on proprietary benchmark suites.",
          "Build low-latency inference pipelines with vLLM and TensorRT-LLM.",
        ],
        requirements: ["Strong mathematical foundation in linear algebra and deep learning."],
        benefits: ["₹60,000 monthly stipend", "Fully remote work flexibility"],
      })
      .returning();

    const [oppQuantum] = await db
      .insert(opportunitiesTable)
      .values({
        companyId: quantum.id,
        title: "Data Engineering Intern",
        location: "Hyderabad, India",
        mode: "onsite",
        type: "internship",
        department: "Data Science",
        deadline: "2026-11-25",
        postedAt: "2026-10-08",
        status: "published",
        stipend: 35000,
        duration: "3 Months",
        skills: ["Python", "SQL", "Spark", "Pandas", "ETL"],
        description: "Develop robust distributed batch and real-time processing pipelines for large-scale biomedical genomic sequences.",
        eligibility: "Open to all students with strong SQL and Python expertise.",
        responsibilities: ["Build ETL data pipelines and validate statistical data integrity."],
        requirements: ["Proficiency in SQL, Python, and relational database modeling."],
        benefits: ["₹35,000 monthly stipend", "Direct exposure to bioinformatics domains"],
      })
      .returning();

    // 5. Seed Applications for Alex Morgan
    if (alex && oppNexus1) {
      const [app1] = await db
        .insert(applicationsTable)
        .values({
          opportunityId: oppNexus1.id,
          studentUserId: alex.id,
          stage: "interview",
          matchScore: 92,
          note: "Top candidate with strong TypeScript and systems foundation.",
        })
        .onConflictDoNothing()
        .returning();

      // Interview for Alex at Nexus
      if (app1) {
        await db.insert(interviewsTable).values({
          applicationId: app1.id,
          scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          kind: "Technical Architecture Round",
          status: "scheduled",
          location: "Google Meet",
        }).onConflictDoNothing();
      }
    }

    if (alex && oppStarlight) {
      await db
        .insert(applicationsTable)
        .values({
          opportunityId: oppStarlight.id,
          studentUserId: alex.id,
          stage: "shortlisted",
          matchScore: 86,
          note: "Shortlisted for Round 1 screening.",
        })
        .onConflictDoNothing();
    }

    if (alex && oppApex) {
      await db
        .insert(applicationsTable)
        .values({
          opportunityId: oppApex.id,
          studentUserId: alex.id,
          stage: "applied",
          matchScore: 78,
        })
        .onConflictDoNothing();
    }

    // Sarah Chen applications
    if (sarah && oppNexus1) {
      await db
        .insert(applicationsTable)
        .values({
          opportunityId: oppNexus1.id,
          studentUserId: sarah.id,
          stage: "shortlisted",
          matchScore: 94,
        })
        .onConflictDoNothing();
    }

    // Rohan Gupta applications
    if (rohan && oppNexus1) {
      await db
        .insert(applicationsTable)
        .values({
          opportunityId: oppNexus1.id,
          studentUserId: rohan.id,
          stage: "applied",
          matchScore: 75,
        })
        .onConflictDoNothing();
    }

    // Saved opportunities for Alex
    if (alex && oppNexus2) {
      await db
        .insert(savedOpportunitiesTable)
        .values({
          opportunityId: oppNexus2.id,
          studentUserId: alex.id,
        })
        .onConflictDoNothing();
    }

    if (alex && oppQuantum) {
      await db
        .insert(savedOpportunitiesTable)
        .values({
          opportunityId: oppQuantum.id,
          studentUserId: alex.id,
        })
        .onConflictDoNothing();
    }

    // 6. Placement Drives
    if (nexus && oppNexus1) {
      await db
        .insert(placementDrivesTable)
        .values({
          companyId: nexus.id,
          opportunityId: oppNexus1.id,
          title: "Nexus Technologies Campus Placement Drive 2026",
          date: "2026-11-20",
          location: "Auditorium & Technology Hall A",
          status: "scheduled",
        })
        .onConflictDoNothing();
    }

    if (apex && oppApex) {
      await db
        .insert(placementDrivesTable)
        .values({
          companyId: apex.id,
          opportunityId: oppApex.id,
          title: "Apex FinTech Annual Hiring Drive 2026",
          date: "2026-12-10",
          location: "Main Convention Center",
          status: "scheduled",
        })
        .onConflictDoNothing();
    }

    // 7. Notifications
    if (alex) {
      await db.insert(notificationsTable).values([
        {
          userId: alex.id,
          title: "Interview Scheduled",
          message: "Your Technical Architecture interview with Nexus Technologies has been scheduled for Friday at 2:00 PM.",
          type: "interview",
          read: false,
        },
        {
          userId: alex.id,
          title: "Application Shortlisted",
          message: "Starlight AI Labs has reviewed and shortlisted your profile for AI Research Engineer Intern.",
          type: "status",
          read: false,
        },
      ]);
    }

    if (rachel) {
      await db.insert(notificationsTable).values([
        {
          userId: rachel.id,
          title: "New Top Candidate Application",
          message: "Alex Morgan (CGPA 8.9) submitted an application for Software Engineering Intern.",
          type: "update",
          read: false,
        },
      ]);
    }

    // 8. Audit logs
    await db.insert(auditLogsTable).values([
      {
        actor: "Rachel Green",
        action: "CREATE_OPPORTUNITY",
        target: "Software Engineering Intern",
        details: "Published new role for Nexus Technologies",
      },
      {
        actor: "Dr. Patrick Owens",
        action: "VERIFY_COMPANY",
        target: "Nexus Technologies",
        details: "Approved company accreditation and campus drive access",
      },
      {
        actor: "Admin Director",
        action: "UPDATE_SYSTEM_SETTINGS",
        target: "Placement Rules 2026",
        details: "Configured eligibility CGPA cutoffs and verification workflow",
      },
    ]);
  }

  console.log("Database seed check completed successfully.");
}

if (process.argv[1] && process.argv[1].includes("seed")) {
  ensureSeedData()
    .then(() => {
      console.log("Seed script executed successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error executing seed script:", err);
      process.exit(1);
    });
}
