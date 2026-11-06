import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

// Ephemeral login codes and invitations are deliberately excluded. Vote photos
// are excluded so a backup cannot extend their promised lifetime.
export const tables=['organizations','members','employee_access','polls','poll_options','votes','audit_events','display_screens'];
const magic=Buffer.from('HUDDLBK1');
const maxBytes=40*1024*1024;
function keyBytes(key){const out=Buffer.from(key||'','base64');if(out.length!==32)throw Error('BACKUP_ENCRYPTION_KEY must be 32 base64-encoded bytes');return out}
export function seal(value,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyBytes(key),iv),plain=Buffer.from(JSON.stringify(value));if(plain.length>maxBytes)throw Error('Backup exceeds the safe size limit; use a streaming backup service');const data=Buffer.concat([cipher.update(gzipSync(plain)),cipher.final()]);return Buffer.concat([magic,iv,cipher.getAuthTag(),data])}
export function openBackup(bytes,key){if(!Buffer.isBuffer(bytes)||!bytes.subarray(0,8).equals(magic)||bytes.length<37)throw Error('Invalid backup format');const decipher=createDecipheriv('aes-256-gcm',keyBytes(key),bytes.subarray(8,20));decipher.setAuthTag(bytes.subarray(20,36));const decoded=gunzipSync(Buffer.concat([decipher.update(bytes.subarray(36)),decipher.final()]),{maxOutputLength:maxBytes});const snapshot=JSON.parse(decoded.toString('utf8'));if(snapshot.version!==1||!snapshot.tables||!tables.every(t=>Array.isArray(snapshot.tables[t])))throw Error('Invalid backup contents');return snapshot}
export function dbClient(url,ca){if(!url)throw Error('Backup database URL is not configured');const parsed=new URL(url);for(const key of ['sslmode','sslrootcert','sslcert','sslkey'])parsed.searchParams.delete(key);return new Client({connectionString:parsed.toString(),ssl:{rejectUnauthorized:true,...(ca?{ca}:{})}})}
export async function snapshotDatabase(client){
  const schema=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');
  const result={version:1,created_at:new Date().toISOString(),schema,schema_sha256:createHash('sha256').update(schema).digest('hex'),tables:{}};
  await client.query('begin isolation level repeatable read read only');
  try{
    for(const table of tables){const sql=table==='votes'?"select (to_jsonb(t) - 'photo_data') || jsonb_build_object('photo_data',null) as row from public.votes t limit 50001":`select * from public."${table}" limit 50001`;const data=(await client.query(sql)).rows;if(data.length>50000)throw Error(`Backup row limit exceeded for ${table}`);result.tables[table]=table==='votes'?data.map(x=>x.row):data}
    await client.query('commit');return result;
  }catch(e){await client.query('rollback');throw e}
}
// This verifier may only restore into a local, empty database. It is not a
// production restore command.
export async function restoreForTest(client,snapshot){
  if(createHash('sha256').update(snapshot.schema).digest('hex')!==snapshot.schema_sha256)throw Error('Backup schema integrity check failed');
  for(const table of tables){const existing=(await client.query(`select count(*)::int as n from public."${table}"`)).rows[0].n;if(existing)throw Error('Restore test database is not empty')}
  await client.query('begin');
  try{
    for(const table of tables){
      const rows=snapshot.tables[table];
      const columns=new Set((await client.query('select column_name from information_schema.columns where table_schema=$1 and table_name=$2',['public',table])).rows.map(x=>x.column_name));
      for(const row of rows)for(const key of Object.keys(row))if(!columns.has(key))throw Error(`Restore schema is missing a column in ${table}`);
      for(let i=0;i<rows.length;i+=100)await client.query(`insert into public."${table}" select * from jsonb_populate_recordset(null::public."${table}",$1::jsonb)`,[JSON.stringify(rows.slice(i,i+100))]);
      const count=(await client.query(`select count(*)::int as n from public."${table}"`)).rows[0].n;
      if(count!==rows.length)throw Error(`Restore count mismatch for ${table}`);
      const mismatch=(await client.query(`select count(*)::int as n from (select to_jsonb(t) as row from public."${table}" t except all select to_jsonb(s) as row from jsonb_populate_recordset(null::public."${table}",$1::jsonb) s) differences`,[JSON.stringify(rows)])).rows[0].n;
      if(mismatch)throw Error(`Restored rows do not match backup for ${table}`);
    }
    await client.query("select setval(pg_get_serial_sequence('public.audit_events','id'),greatest(coalesce(max(id),0),1),max(id) is not null) from public.audit_events");
    await client.query('commit');
  }catch(e){await client.query('rollback');throw e}
}
