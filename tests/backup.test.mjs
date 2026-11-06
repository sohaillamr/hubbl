import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { seal,openBackup,snapshotDatabase,tables } from '../scripts/backup-lib.mjs';

test('backup is encrypted and authenticated, and temporary vote photos are omitted',async()=>{
  const seen=[];
  const client={async query(sql){seen.push(sql);if(sql.includes('from public."votes"'))return {rows:[{row:{id:'vote',photo_data:null}}]};if(sql.includes('from public."audit_events"'))return {rows:[{row:{id:'9007199254740993',created_at:'2026-11-06T01:02:03.123456+00:00'}}]};return {rows:[]}}};
  const snapshot=await snapshotDatabase(client);
  assert.equal(snapshot.tables.votes[0].photo_data,null);
  assert.ok(seen.some(sql=>sql.includes("to_jsonb(t) - 'photo_data'")));
  assert.ok(seen[0].includes('repeatable read'));
  assert.ok(seen.includes('commit'));
  assert.deepEqual(Object.keys(snapshot.tables),tables);
  const key=randomBytes(32).toString('base64'),encoded=seal(snapshot,key);
  assert.equal(encoded.includes(Buffer.from('temporary photo')),false);
  assert.equal(openBackup(encoded,key).tables.votes[0].photo_data,null);
  assert.equal(openBackup(encoded,key).tables.audit_events[0].id,'9007199254740993');
  assert.match(openBackup(encoded,key).tables.audit_events[0].created_at,/123456/);
  assert.throws(()=>openBackup(encoded,randomBytes(32).toString('base64')));
  const altered=Buffer.from(encoded);altered[altered.length-1]^=1;
  assert.throws(()=>openBackup(altered,key));
});

test('a failed snapshot rolls its transaction back',async()=>{
  const calls=[];const client={async query(sql){calls.push(sql);if(sql.includes('"members"'))throw Error('database unavailable');return {rows:[]}}};
  await assert.rejects(snapshotDatabase(client),/database unavailable/);
  assert.equal(calls.at(-1),'rollback');
});
