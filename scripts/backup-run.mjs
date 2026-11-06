import { Client } from 'pg';
import { put, get, list, del } from '@vercel/blob';
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dbClient, snapshotDatabase, seal, openBackup, restoreForTest } from './backup-lib.mjs';

const operation=process.argv[2],key=process.env.BACKUP_ENCRYPTION_KEY;
if(!process.env.BLOB_READ_WRITE_TOKEN)throw Error('Private backup store is not configured');
if(operation==='create'){
  const client=dbClient(process.env.BACKUP_DATABASE_URL,process.env.SUPABASE_CA_CERT);
  let snapshot;try{await client.connect();snapshot=await snapshotDatabase(client)}finally{await client.end()}
  const data=seal(snapshot,key);openBackup(data,key);
  const pathname=`huddl-backups/${new Date().toISOString().slice(0,10)}/${randomUUID()}.huddl`;
  const blob=await put(pathname,data,{access:'private',contentType:'application/octet-stream',addRandomSuffix:false});
  if(!blob.pathname.startsWith('huddl-backups/'))throw Error('Unexpected backup location');
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`pathname=${blob.pathname}\n`);
  console.log('Encrypted backup uploaded; bytes:',data.length,'tables:',Object.keys(snapshot.tables).length);
}else if(operation==='verify'){
  const target=new URL(process.env.RESTORE_TEST_DATABASE_URL||'http://invalid');
  if(!['127.0.0.1','localhost','::1','[::1]'].includes(target.hostname)||target.pathname!=='/huddl_restore')throw Error('Restore test must target the isolated local huddl_restore database');
  const pathname=process.env.BACKUP_PATH||'';
  if(!/^huddl-backups\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.huddl$/.test(pathname))throw Error('Invalid backup path');
  const blob=await get(pathname,{access:'private',useCache:false});if(!blob||blob.statusCode!==200)throw Error('Could not download backup');
  const parts=[];let size=0;for await(const chunk of blob.stream){size+=chunk.length;if(size>45*1024*1024)throw Error('Backup is too large');parts.push(Buffer.from(chunk))}
  const snapshot=openBackup(Buffer.concat(parts),key);
  const client=new Client({connectionString:target.toString()});
  try{
    await client.connect();
    const existing=(await client.query("select count(*)::int as n from information_schema.tables where table_schema='public'")).rows[0].n;
    if(existing)throw Error('Restore test database is not empty');
    await client.query("do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$");
    // pg_cron is Supabase infrastructure; it is not installed in this disposable
    // local PostgreSQL test. The production schema and data are otherwise used.
    const from=snapshot.schema.indexOf('-- Keep timed questions accurate'),to=snapshot.schema.indexOf('create table if not exists audit_events',from);
    if(from<0||to<0)throw Error('Unknown schema; cannot safely verify restore');
    await client.query(snapshot.schema.slice(0,from)+snapshot.schema.slice(to));
    await restoreForTest(client,snapshot);
    const photos=(await client.query('select count(*)::int as n from votes where photo_data is not null')).rows[0].n;
    if(photos)throw Error('Temporary vote photos were present in backup');
    console.log('Restore verification passed for all application tables; temporary vote photos:',photos);
  }finally{await client.end()}
}else if(operation==='prune'){
  const all=[];let cursor;
  do{const page=await list({prefix:'huddl-backups/',limit:1000,...(cursor?{cursor}:{})});all.push(...page.blobs);cursor=page.hasMore?page.cursor:undefined}while(cursor);
  all.sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt));
  const cutoff=Date.now()-7*86400000,expired=all.slice(7).filter(x=>new Date(x.uploadedAt).getTime()<cutoff&&/^huddl-backups\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.huddl$/.test(x.pathname));
  if(expired.length)await del(expired.map(x=>x.url));
  console.log('Backup retention: kept',all.length-expired.length,'removed',expired.length);
}else throw Error('Expected create, verify or prune');
