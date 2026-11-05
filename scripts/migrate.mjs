import { readFileSync, existsSync } from 'node:fs';
import { Client } from 'pg';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before running the migration.');
const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: !!process.env.SUPABASE_CA_CERT, ...(process.env.SUPABASE_CA_CERT ? { ca: process.env.SUPABASE_CA_CERT } : {}) } });
try {
  await db.connect();
  await db.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  console.log('Huddl schema applied.');
} finally {
  await db.end();
}
