import { Client } from 'pg';
import { Resend } from 'resend';
import { createHash, randomBytes } from 'node:crypto';

if (process.loadEnvFile) {
  try { process.loadEnvFile('.env.local'); } catch {}
}
const { DATABASE_URL, RESEND_API_KEY, EMAIL_FROM, EMAIL_TEST_RECIPIENT, PUBLIC_SITE_URL, OWNER_EMAIL } = process.env;
if (!DATABASE_URL || !RESEND_API_KEY || !EMAIL_FROM || !OWNER_EMAIL) throw new Error('Database, Resend, sender, and owner email are required.');
const db = new Client({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:true,...(process.env.SUPABASE_CA_CERT?{ca:process.env.SUPABASE_CA_CERT}:{})}});
await db.connect();
try {
  const owner=(await db.query("select m.id,m.email,o.id as org_id,o.name,o.slug from members m join organizations o on o.id=m.organization_id where lower(m.email)=lower($1) and m.role='owner' and o.is_active=true order by o.created_at limit 1",[OWNER_EMAIL])).rows[0];
  if(!owner)throw new Error('Active HR owner not found.');
  const token=randomBytes(32).toString('hex');
  const tokenHash=createHash('sha256').update(token).digest('hex');
  const invite=(await db.query("insert into admin_invites(organization_id,member_id,token_hash,expires_at) values($1,$2,$3,now()+interval '7 days') returning id",[owner.org_id,owner.id,tokenHash])).rows[0];
  const portal=`${PUBLIC_SITE_URL||'https://huddl-place.vercel.app'}/workspace?org=${encodeURIComponent(owner.slug)}&view=admin`;
  const url=`${portal}&invite=${token}`;
  try {
    const result=await new Resend(RESEND_API_KEY).emails.send({from:EMAIL_FROM,to:EMAIL_TEST_RECIPIENT||owner.email,subject:`Your ${owner.name} Huddl HR portal`,text:`This invitation is for ${owner.email}. Set your HR password using this private link within 7 days:\n${url}\n\nYour HR portal: ${portal}`});
    if(result.error)throw new Error(result.error.message||'Resend rejected the email');
  } catch(error) {
    await db.query('delete from admin_invites where id=$1',[invite.id]);
    throw error;
  }
  await db.query("insert into audit_events(organization_id,actor_id,action) values($1,$2,'portal.email.sent')",[owner.org_id,owner.id]);
  console.log(`HR setup link accepted for delivery to ${EMAIL_TEST_RECIPIENT||owner.email}.`);
} finally {
  await db.end();
}
