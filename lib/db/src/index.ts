import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { neon, neonConfig } from "@neondatabase/serverless";
import pg from "pg";
import path from "path";
import fs from "fs";
import dns from "node:dns";
import * as schema from "./schema";

const NEON_IPS = ["18.189.49.143", "3.18.239.121", "3.141.122.14"];
const origLookup = dns.lookup;

// Non-intrusive DNS fallback: Try native lookup first. If ISP/network blocks Neon with ENOTFOUND, fallback to NEON_IPS.
(dns as any).lookup = function (hostname: string, options: any, callback: any) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  return (origLookup as any).call(dns, hostname, options, (err: any, address: any, family: any) => {
    if (
      err &&
      (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") &&
      hostname &&
      (hostname.includes("neon.tech") || hostname.includes("c-7"))
    ) {
      if (options && typeof options === "object" && options.all) {
        return callback(null, NEON_IPS.map((ip) => ({ address: ip, family: 4 })));
      }
      return callback(null, NEON_IPS[0], 4);
    }
    return callback(err, address, family);
  });
};

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Ignore DNS config errors on restricted runtimes
}

neonConfig.fetchEndpoint = (host) => `https://${host}/sql`;

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  const possiblePaths = [
    path.resolve(process.cwd(), "artifacts/api-server/.env"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../../artifacts/api-server/.env"),
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, ".env"),
  ];
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let val = (match[2] || "").trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
      if (process.env.DATABASE_URL) break;
    }
  }
}

// Fallback to project Neon PostgreSQL database if omitted in manual host setups
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://neondb_owner:npg_hG5fHj4mupMI@ep-late-smoke-b5ukxvyf-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require";
}

const dbUrl = process.env.DATABASE_URL;
const isNeon = dbUrl.includes("neon.tech");
const isLocalhost = dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");

export const pool = !isNeon
  ? new Pool({
      connectionString: dbUrl,
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
    })
  : null;

import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export const db: NodePgDatabase<typeof schema> = (isNeon
  ? drizzleNeon(neon(dbUrl), { schema })
  : drizzlePg(pool!, { schema })) as unknown as NodePgDatabase<typeof schema>;

export * from "./schema";
