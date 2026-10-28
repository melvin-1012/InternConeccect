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

// Intercept DNS lookups for Neon to prevent ENOTFOUND on Windows/ISP networks
// @ts-expect-error monkey-patching for DNS reliability
dns.lookup = function (hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  if (hostname && (hostname.includes("neon.tech") || hostname.includes("c-7"))) {
    if (options && typeof options === "object" && options.all) {
      return callback(null, NEON_IPS.map((address) => ({ address, family: 4 })));
    }
    return callback(null, NEON_IPS[0], 4);
  }
  return origLookup.call(dns, hostname, options, callback);
};

try {
  dns.setDefaultResultOrder("ipv4first");
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {
  // Ignore DNS config errors on restricted runtimes
}

neonConfig.fetchEndpoint = (host) => `https://${host}/sql`;

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, "../../artifacts/api-server/.env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || "").trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        process.env[key] = val;
      }
    }
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
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

export const db: any = isNeon
  ? drizzleNeon(neon(dbUrl), { schema })
  : drizzlePg(pool!, { schema });

export * from "./schema";
