import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { Client } from 'pg';
import { SignJWT } from 'jose';
import handler from '../api/index.js';

test('company screens, a live photo vote, and photo deletion on close', { skip: !process.env.DATABASE_URL }, async () => {
  process.env.SESSION_SECRET ||= 'huddl-integration-test-secret-please-change';
  const db = new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:!!process.env.SUPABASE_CA_CERT,...(process.env.SUPABASE_CA_CERT?{ca:process.env.SUPABASE_CA_CERT}:{})}});
  await db.connect();
  const slug=`test-${randomUUID().slice(0,8)}`;
  const previousPlatformEmail=process.env.PLATFORM_ADMIN_EMAIL;
  let orgId;
  const call=async(method,path,body,cookie='')=>{
    const response={headers:{},statusCode:200,setHeader(key,value){this.headers[key]=value},status(code){this.statusCode=code;return this},json(value){this.body=value;return this}};
    await handler({method,url:`/api${path}`,body,headers:{cookie}},response);
    return response;
  };
  try{
    orgId=(await db.query('insert into organizations(slug,name) values($1,$2) returning id',[slug,'Test Company'])).rows[0].id;
    const memberId=(await db.query("insert into members(organization_id,email,display_name,department,role) values($1,$2,'Nour','People','owner') returning id",[orgId,`${slug}@example.com`])).rows[0].id;
    const token=await new SignJWT({sub:memberId,org:orgId,role:'owner',name:'Nour',email:`${slug}@example.com`}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('90d').sign(new TextEncoder().encode(process.env.SESSION_SECRET));
    const cookie=`huddl_session=${token}`;
    const inviteToken=randomBytes(32).toString('hex');
    await db.query("insert into admin_invites(organization_id,member_id,token_hash,expires_at) values($1,$2,$3,now()+interval '7 days')",[orgId,memberId,createHash('sha256').update(inviteToken).digest('hex')]);
    const accepted=await call('POST','/auth/invite/accept',{token:inviteToken,password:'test-password-12345'});
    assert.equal(accepted.statusCode,200);
    assert.match(accepted.headers['Set-Cookie'],/Max-Age=7776000/);
    assert.equal((await call('POST','/auth/invite/accept',{token:inviteToken,password:'test-password-12345'})).statusCode,410);

    const created=await call('POST',`/org/${slug}/screens`,{name:'Kitchen',location:'Floor 2'},cookie);
    assert.equal(created.statusCode,201);
    assert.equal((await call('GET',`/org/${slug}/screens`,null,cookie)).body.screens.length,1);
    const screen=created.body.screen;
    process.env.PLATFORM_ADMIN_EMAIL=`${slug}@example.com`;
    const overview=await call('GET','/platform/overview',null,cookie);
    assert.equal(overview.statusCode,200);
    assert.equal(overview.body.organizations.find(o=>o.id===orgId).screens,1);
    assert.equal((await call('GET',`/org/${slug}/display?screen=${screen.token}`)).statusCode,200);

    const pollId=(await db.query("insert into polls(organization_id,question,status,mode) values($1,'Tea or coffee today?','live','social') returning id",[orgId])).rows[0].id;
    const optionId=(await db.query("insert into poll_options(poll_id,label,position) values($1,'Tea',0) returning id",[pollId])).rows[0].id;
    const vote=await call('POST',`/org/${slug}/votes`,{poll_id:pollId,option_id:optionId,show_identity:true,photo_data:'data:image/jpeg;base64,/9j/2Q=='},cookie);
    assert.equal(vote.statusCode,201);
    const live=await call('GET',`/org/${slug}/display?screen=${screen.token}`);
    assert.equal(live.body.poll.people[0].display_name,'Nour');
    assert.ok(live.body.poll.people[0].photo_data);
    assert.equal((await call('PATCH',`/org/${slug}/polls/${pollId}`,{status:'closed'},cookie)).statusCode,200);
    assert.equal((await db.query('select photo_data from votes where poll_id=$1',[pollId])).rows[0].photo_data,null);

    const updated=await call('PATCH',`/org/${slug}/screens/${screen.id}`,{name:'Kitchen',location:'Floor 2',is_active:false},cookie);
    assert.equal(updated.body.screen.is_active,false);
    assert.equal((await call('GET',`/org/${slug}/display?screen=${screen.token}`)).statusCode,404);
  }finally{
    if(previousPlatformEmail===undefined)delete process.env.PLATFORM_ADMIN_EMAIL;else process.env.PLATFORM_ADMIN_EMAIL=previousPlatformEmail;
    if(orgId)await db.query('delete from organizations where id=$1',[orgId]);
    await db.end();
  }
});
