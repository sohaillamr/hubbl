import { Pool } from 'pg';
import { SignJWT, jwtVerify } from 'jose';
import { randomInt, scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';
import { Resend } from 'resend';

// Supabase's shared pooler uses its own CA. TLS is always required; supply
// SUPABASE_CA_CERT from Database Settings to also verify the server identity.
const pool = process.env.DATABASE_URL ? new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:!!process.env.SUPABASE_CA_CERT,...(process.env.SUPABASE_CA_CERT?{ca:process.env.SUPABASE_CA_CERT}:{})},max:1}) : null;
const json=(res,status,data)=>res.status(status).json(data);
const fail=(status,message)=>Object.assign(new Error(message),{status});
const secret=()=>{if(!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length<32)throw fail(503,'SESSION_SECRET is not configured');return new TextEncoder().encode(process.env.SESSION_SECRET)};
const hash=value=>{const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(value,salt,64).toString('hex')}`};
const compare=(value,stored)=>{if(!stored)return false;const [salt,hex]=stored.split(':');if(!salt||!hex)return false;const actual=scryptSync(value,salt,64),expected=Buffer.from(hex,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected)};
const query=(sql,args=[])=>pool.query(sql,args);
const cookie=req=>(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('huddl_session='))?.slice(14);
async function auth(req){const token=cookie(req);if(!token)throw fail(401,'Sign in required');try{return (await jwtVerify(token,secret())).payload}catch{throw fail(401,'Session expired')}}
async function session(res,user){const token=await new SignJWT({sub:user.id,org:user.organization_id,role:user.role,name:user.display_name,email:user.email}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('7d').sign(secret());res.setHeader('Set-Cookie',`huddl_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`)}
const body=req=>typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{};
const validEmail=x=>typeof x==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)&&x.length<255;
const clean=(x,max)=>typeof x==='string'?x.trim().slice(0,max):'';
const requireAdmin=user=>{if(!['owner','admin'].includes(user.role))throw fail(403,'Admin access required')};
const requireOrg=(user,org)=>{if(user.org!==org.id && (!process.env.PLATFORM_ADMIN_EMAIL||user.email?.toLowerCase()!==process.env.PLATFORM_ADMIN_EMAIL.toLowerCase()))throw fail(403,'Wrong organization')};
async function organization(slug){const {rows}=await query('select * from organizations where slug=$1',[slug]);if(!rows[0])throw fail(404,'Company not found');return rows[0]}
const requirePlatform=user=>{if(!process.env.PLATFORM_ADMIN_EMAIL||user.email?.toLowerCase()!==process.env.PLATFORM_ADMIN_EMAIL.toLowerCase())throw fail(403,'Platform owner access required')};
async function audit(org,user,action,target=null,metadata={}){await query('insert into audit_events(organization_id,actor_id,action,target_id,metadata) values($1,$2,$3,$4,$5)',[org,user,action,target,JSON.stringify(metadata)])}
async function sendCode(email,code,company){if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)throw fail(503,'Email delivery is not configured');const resend=new Resend(process.env.RESEND_API_KEY);const result=await resend.emails.send({from:process.env.EMAIL_FROM,to:email,subject:`Your ${company} Huddl sign-in code`,text:`Your Huddl code is ${code}. It expires in 10 minutes.`});if(result.error)throw fail(502,'Could not send sign-in email')}
async function activePoll(orgId){const {rows}=await query(`select p.id,p.question,p.status,p.mode,p.opens_at,p.closes_at,p.created_at from polls p where p.organization_id=$1 and p.status='live' and (p.opens_at is null or p.opens_at<=now()) and (p.closes_at is null or p.closes_at>now()) limit 1`,[orgId]);return rows[0]}
async function pollWithOptions(poll){if(!poll)return null;const {rows}=await query('select id,label,position from poll_options where poll_id=$1 order by position',[poll.id]);return {...poll,options:rows}}
async function display(org){const poll=await pollWithOptions(await activePoll(org.id));if(!poll)return {organization:{id:org.id,slug:org.slug,name:org.name,accent_color:org.accent_color,logo_data:org.logo_data},poll:null};const {rows}=await query(`select o.id,o.label,o.position,count(v.id)::int as votes from poll_options o left join votes v on v.option_id=o.id where o.poll_id=$1 group by o.id order by o.position`,[poll.id]);const people=poll.mode==='social'?(await query(`select v.option_id,m.display_name,m.department from votes v join members m on m.id=v.member_id where v.poll_id=$1 and v.show_identity=true order by v.created_at desc limit 60`,[poll.id])).rows:[];return {organization:{id:org.id,slug:org.slug,name:org.name,accent_color:org.accent_color,logo_data:org.logo_data},poll:{...poll,options:rows,people,total:rows.reduce((n,x)=>n+x.votes,0)}}}

export default async function handler(req,res){
  try{
    if(!pool)throw fail(503,'DATABASE_URL is not configured');
    const requestUrl=new URL(req.url,'http://localhost'); const path=(requestUrl.searchParams.get('route')||requestUrl.pathname.replace(/^\/api\/?/,'')).split('/').filter(Boolean);
    const method=req.method;
    if(path[0]==='health'&&method==='GET'){await query('select 1');return json(res,200,{ok:true})}
    if(path[0]==='setup'&&method==='POST'){
      if(!process.env.SETUP_SECRET||req.headers['x-setup-secret']!==process.env.SETUP_SECRET)throw fail(403,'Setup access denied');
      const b=body(req),slug=clean(b.slug,40).toLowerCase(),email=clean(b.email,255).toLowerCase(),password=b.password;
      if(!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)||!clean(b.name,80)||!validEmail(email)||typeof password!=='string'||password.length<12)throw fail(400,'Invalid setup details');
      const client=await pool.connect();try{await client.query('begin');const org=(await client.query('insert into organizations(slug,name,allowed_email_domain) values($1,$2,$3) returning *',[slug,clean(b.name,80),clean(b.domain,100).toLowerCase()||null])).rows[0];await client.query('insert into members(organization_id,email,display_name,department,role,password_hash) values($1,$2,$3,$4,$5,$6)',[org.id,email,clean(b.admin_name,80)||'Admin','People','owner',hash(password)]);await client.query('commit');return json(res,201,{id:org.id,slug})}catch(e){await client.query('rollback');throw e}finally{client.release()}
    }
    if(path[0]==='auth'&&path[1]==='admin'&&method==='POST'){
      const b=body(req),org=await organization(clean(b.slug,40));const {rows}=await query('select * from members where organization_id=$1 and lower(email)=lower($2) and role in (\'owner\',\'admin\')',[org.id,clean(b.email,255)]);if(!rows[0]||!compare(b.password||'',rows[0].password_hash))throw fail(401,'Invalid credentials');await session(res,rows[0]);return json(res,200,{name:rows[0].display_name,role:rows[0].role,organization:org.slug})
    }
    if(path[0]==='auth'&&path[1]==='request'&&method==='POST'){
      const b=body(req),org=await organization(clean(b.slug,40)),email=clean(b.email,255).toLowerCase();if(!validEmail(email))throw fail(400,'Invalid email');if(org.allowed_email_domain&&!email.endsWith('@'+org.allowed_email_domain))throw fail(403,'Use your company email');const recent=await query(`select count(*)::int as n from login_codes where organization_id=$1 and email=$2 and created_at>now()-interval '15 minutes'`,[org.id,email]);if(recent.rows[0].n>=3)throw fail(429,'Try again in 15 minutes');const code=String(randomInt(100000,1000000));await query(`insert into login_codes(organization_id,email,code_hash,expires_at) values($1,$2,$3,now()+interval '10 minutes')`,[org.id,email,hash(code)]);await sendCode(email,code,org.name);return json(res,200,{sent:true})
    }
    if(path[0]==='auth'&&path[1]==='verify'&&method==='POST'){
      const b=body(req),org=await organization(clean(b.slug,40)),email=clean(b.email,255).toLowerCase();const result=await query(`select * from login_codes where organization_id=$1 and email=$2 and expires_at>now() order by created_at desc limit 1`,[org.id,email]);const code=result.rows[0];if(!code||code.attempts>=5)throw fail(401,'Invalid or expired code');await query('update login_codes set attempts=attempts+1 where id=$1',[code.id]);if(!compare(String(b.code||''),code.code_hash))throw fail(401,'Invalid or expired code');await query('delete from login_codes where id=$1',[code.id]);let user=(await query('select * from members where organization_id=$1 and email=$2',[org.id,email])).rows[0];if(!user)user=(await query('insert into members(organization_id,email,display_name,department) values($1,$2,$3,$4) returning *',[org.id,email,clean(b.name,80)||email.split('@')[0],clean(b.department,80)])).rows[0];await session(res,user);return json(res,200,{name:user.display_name,role:user.role,organization:org.slug})
    }
    if(path[0]==='auth'&&path[1]==='logout'&&method==='POST'){res.setHeader('Set-Cookie','huddl_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');return json(res,200,{ok:true})}
    if(path[0]==='me'&&method==='GET'){const user=await auth(req);return json(res,200,{id:user.sub,org:user.org,role:user.role,name:user.name,platform:!!process.env.PLATFORM_ADMIN_EMAIL&&user.email?.toLowerCase()===process.env.PLATFORM_ADMIN_EMAIL.toLowerCase()})}
    if(path[0]==='platform'){
      const user=await auth(req);requirePlatform(user);
      if(path[1]==='overview'&&method==='GET'){
        const {rows}=await query(`select o.id,o.slug,o.name,o.allowed_email_domain,o.accent_color,o.is_active,o.created_at,count(distinct m.id)::int as members,count(distinct p.id)::int as polls,count(distinct v.id)::int as votes from organizations o left join members m on m.organization_id=o.id left join polls p on p.organization_id=o.id left join votes v on v.organization_id=o.id group by o.id order by o.created_at desc`);
        return json(res,200,{organizations:rows,totals:{companies:rows.length,members:rows.reduce((n,x)=>n+x.members,0),votes:rows.reduce((n,x)=>n+x.votes,0)}})
      }
      if(path[1]==='organizations'&&path[2]&&method==='PATCH'){
        const b=body(req),active=b.is_active===true,name=clean(b.name,80);if(!name)throw fail(400,'Company name required');const result=await query('update organizations set name=$2,is_active=$3 where id=$1 returning id',[path[2],name,active]);if(!result.rows[0])throw fail(404,'Company not found');await audit(path[2],user.sub,'platform.organization.updated',path[2],{active});return json(res,200,{ok:true})
      }
      if(path[1]==='organizations'&&method==='POST'){
        const b=body(req),slug=clean(b.slug,40).toLowerCase(),email=clean(b.email,255).toLowerCase(),password=b.password;
        if(!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)||!clean(b.name,80)||!validEmail(email)||typeof password!=='string'||password.length<12)throw fail(400,'Invalid company details');
        const client=await pool.connect();try{await client.query('begin');const org=(await client.query('insert into organizations(slug,name,allowed_email_domain) values($1,$2,$3) returning *',[slug,clean(b.name,80),clean(b.domain,100).toLowerCase()||null])).rows[0];await client.query('insert into members(organization_id,email,display_name,department,role,password_hash) values($1,$2,$3,$4,$5,$6)',[org.id,email,clean(b.admin_name,80)||'Admin','People','owner',hash(password)]);await client.query('commit');await audit(org.id,user.sub,'platform.organization.created',org.id);return json(res,201,{id:org.id,slug})}catch(e){await client.query('rollback');throw e}finally{client.release()}
      }
    }
    if(path[0]==='org'&&path[1]){
      const org=await organization(path[1]),route=path[2];if(!org.is_active)throw fail(403,'This company space is paused');
      if(route==='display'&&method==='GET'){res.setHeader('Cache-Control','no-store');return json(res,200,await display(org))}
      const user=await auth(req);requireOrg(user,org);
      if(route==='votes'&&method==='POST'){
        const b=body(req),poll=await activePoll(org.id);if(!poll||poll.id!==b.poll_id)throw fail(409,'Question is no longer live');const option=(await query('select id from poll_options where poll_id=$1 and id=$2',[poll.id,b.option_id])).rows[0];if(!option)throw fail(400,'Invalid choice');const result=await query('insert into votes(organization_id,poll_id,option_id,member_id,show_identity) values($1,$2,$3,$4,$5) on conflict(poll_id,member_id) do nothing returning id',[org.id,poll.id,option.id,user.sub,poll.mode==='social'&&b.show_identity===true]);if(!result.rows[0])throw fail(409,'You already voted');return json(res,201,{ok:true})
      }
      requireAdmin(user);
      if(route==='metrics'&&method==='GET'){const {rows}=await query(`select p.id,p.question,p.status,p.created_at,count(v.id)::int as votes,count(distinct m.department)::int as departments from polls p left join votes v on v.poll_id=p.id left join members m on m.id=v.member_id where p.organization_id=$1 group by p.id order by p.created_at desc limit 30`,[org.id]);const members=(await query('select count(*)::int as n from members where organization_id=$1',[org.id])).rows[0].n;return json(res,200,{members,polls:rows})}
      if(route==='members'&&method==='GET'){const {rows}=await query('select id,email,display_name,department,role,created_at from members where organization_id=$1 order by created_at desc limit 500',[org.id]);return json(res,200,{members:rows})}
      if(route==='branding'&&method==='PATCH'){const b=body(req),name=clean(b.name,80),accent=clean(b.accent_color,7),logo=typeof b.logo_data==='string'&&b.logo_data.length<150000?b.logo_data:null;if(!name||!/^#[0-9a-fA-F]{6}$/.test(accent))throw fail(400,'Invalid branding');await query('update organizations set name=$2,accent_color=$3,logo_data=$4 where id=$1',[org.id,name,accent,logo]);await audit(org.id,user.sub,'branding.updated');return json(res,200,{ok:true})}
      if(route==='polls'&&method==='GET'){const {rows}=await query('select id,question,status,mode,opens_at,closes_at,created_at from polls where organization_id=$1 order by created_at desc limit 100',[org.id]);return json(res,200,{polls:await Promise.all(rows.map(pollWithOptions))})}
      if(route==='polls'&&method==='POST'){
        const b=body(req),question=clean(b.question,240),options=b.options,mode=b.mode==='anonymous'?'anonymous':'social';if(question.length<5||!Array.isArray(options)||options.length<2||options.length>8||options.some(x=>!clean(x,100)))throw fail(400,'Provide a question and 2–8 choices');const client=await pool.connect();try{await client.query('begin');const poll=(await client.query('insert into polls(organization_id,question,mode,created_by) values($1,$2,$3,$4) returning id',[org.id,question,mode,user.sub])).rows[0];for(let i=0;i<options.length;i++)await client.query('insert into poll_options(poll_id,label,position) values($1,$2,$3)',[poll.id,clean(options[i],100),i]);await client.query('commit');await audit(org.id,user.sub,'poll.created',poll.id);return json(res,201,{id:poll.id})}catch(e){await client.query('rollback');throw e}finally{client.release()}
      }
      if(route==='polls'&&path[3]&&method==='PATCH'){
        const id=path[3],b=body(req);if(!['draft','live','closed'].includes(b.status))throw fail(400,'Invalid status');const existing=(await query('select * from polls where id=$1 and organization_id=$2',[id,org.id])).rows[0];if(!existing)throw fail(404,'Question not found');if(b.status==='live')await query(`update polls set status='closed',updated_at=now() where organization_id=$1 and status='live' and id<>$2`,[org.id,id]);await query('update polls set status=$3,updated_at=now() where id=$1 and organization_id=$2',[id,org.id,b.status]);await audit(org.id,user.sub,'poll.status',id,{status:b.status});return json(res,200,{ok:true})
      }
    }
    throw fail(404,'Endpoint not found');
  }catch(e){console.error('API error',e.code||e.message);return json(res,e.status||(/duplicate key/.test(e.message)?409:500),{error:e.status?e.message:'Request failed',code:e.status?undefined:(e.code||'UNKNOWN')})}
}

