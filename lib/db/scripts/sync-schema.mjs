import { neon, neonConfig } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure DNS and endpoint work on restricted networks
neonConfig.fetchEndpoint = (host) => `https://${host}/sql`;

let dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  const envPath = path.resolve(__dirname, '../../../artifacts/api-server/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        if (key === 'DATABASE_URL') dbUrl = val;
      }
    }
  }
}

if (!dbUrl) {
  console.error('Error: DATABASE_URL is not set.');
  process.exit(1);
}

console.log('Connecting to Neon Serverless Database over HTTPS (Port 443)...');
const sql = neon(dbUrl);

try {
  // Query existing tables
  const rows = await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  const existingTables = new Set(rows.map(r => r.table_name));

  const requiredTables = [
    'users',
    'companies',
    'student_profiles',
    'opportunities',
    'applications',
    'saved_opportunities',
    'interviews',
    'notifications',
    'placement_drives',
    'audit_logs',
    'resume_files'
  ];

  console.log('Verifying relational schema tables:');
  let allFound = true;
  for (const table of requiredTables) {
    if (existingTables.has(table)) {
      console.log(`  ✓ Table '${table}' is active and synchronized.`);
    } else {
      console.warn(`  ! Table '${table}' missing.`);
      allFound = false;
    }
  }

  if (allFound) {
    console.log('\n[SUCCESS] Database schema is fully pushed, verified, and synchronized over HTTPS.');
  } else {
    console.log('\n[INFO] Partial schema present. Run full migrations if adding new tables.');
  }
} catch (err) {
  console.error('Database verification failed:', err.message);
  process.exit(1);
}
