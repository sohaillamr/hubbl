// Restore only to an explicitly confirmed, empty, separate database. Never
// point this command at a live company database.
import { get } from '@vercel/blob';
import { dbClient,openBackup,restoreForTest } from './backup-lib.mjs';

const pathname=process.env.BACKUP_PATH||'',target=process.env.RESTORE_DATABASE_URL||'';
if(!/^huddl-backups\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.huddl$/.test(pathname))throw Error('Set BACKUP_PATH to a verified backup path');
if(!target||!process.env.BACKUP_DATABASE_URL)throw Error('Set both RESTORE_DATABASE_URL and BACKUP_DATABASE_URL');
const destination=new URL(target),source=new URL(process.env.BACKUP_DATABASE_URL);
if(destination.hostname===source.hostname&&destination.username===source.username)throw Error('Refusing to restore into the backup source');
if(process.env.CONFIRM_RESTORE_HOST!==destination.hostname)throw Error('Set CONFIRM_RESTORE_HOST to the destination hostname');
const blob=await get(pathname,{access:'private',useCache:false});if(!blob||blob.statusCode!==200)throw Error('Backup could not be fetched');
const parts=[];let size=0;for await(const chunk of blob.stream){size+=chunk.length;if(size>45*1024*1024)throw Error('Backup is too large');parts.push(Buffer.from(chunk))}
const snapshot=openBackup(Buffer.concat(parts),process.env.BACKUP_ENCRYPTION_KEY);
const client=dbClient(target,process.env.RESTORE_CA_CERT);
try{await client.connect();await restoreForTest(client,snapshot);console.log('Restored encrypted application data into the empty destination')}finally{await client.end()}
