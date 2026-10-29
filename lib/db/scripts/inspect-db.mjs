import { neon, neonConfig } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dns from 'node:dns';

try {
  dns.setDefaultResultOrder('ipv4first');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

const NEON_IPS = ['18.189.49.143', '3.18.239.121', '3.141.122.14'];
const origLookup = dns.lookup;
dns.lookup = function (hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  return origLookup.call(dns, hostname, options, (err, address, family) => {
    if (
      err &&
      (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') &&
      hostname &&
      (hostname.includes('neon.tech') || hostname.includes('c-7'))
    ) {
      if (options && typeof options === 'object' && options.all) {
        return callback(null, NEON_IPS.map((ip) => ({ address: ip, family: 4 })));
      }
      return callback(null, NEON_IPS[0], 4);
    }
    return callback(err, address, family);
  });
};

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

const sql = neon(dbUrl);

async function main() {
  console.log('Querying Neon PostgreSQL database...');
  const tables = await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
  console.log('\n--- Active Tables in Public Schema ---');
  for (const t of tables) {
    const rows = await sql.query(`SELECT count(*) as count FROM "${t.table_name}"`);
    console.log(`- ${t.table_name}: ${rows[0].count} rows`);
  }

  console.log('\n--- Sample Opportunities ---');
  const opps = await sql.query('SELECT id, title, company_id, location, status FROM opportunities LIMIT 3');
  console.table(opps);

  console.log('\n--- Sample Users ---');
  const users = await sql.query('SELECT id, name, email, role, status FROM users LIMIT 5');
  console.table(users);
}

main().catch(console.error);
