import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const source=readFileSync(new URL('../workspace.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('injectSpeedInsights();','');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function app(view='admin'){
  const dom=new JSDOM('<div id="app"></div>',{url:`https://huddl.test/workspace?org=demo&view=${view}`,runScripts:'outside-only'});
  const w=dom.window,calls=[];
  const org={id:'org-1',slug:'demo',name:'Cairo Team',accent_color:'#244f9b',logo_data:null};
  const screen={id:'screen-1',name:'Kitchen',location:'Floor 2',token:'token-1',is_active:true};
  w.fetch=async(url,options={})=>{calls.push({url,options});let data={ok:true};
    if(url==='/api/me')data={id:'member-1',org:org.id,role:'owner',name:'Nour',platform:view==='platform'};
    if(url.endsWith('/metrics'))data={members:3,polls:[]};
    if(url.endsWith('/polls'))data={polls:[]};
    if(url.endsWith('/members'))data={members:[]};
    if(url.endsWith('/display'))data={organization:org,poll:null};
    if(url.endsWith('/screens'))data={screens:[screen],screen_limit:2,active:1};
    if(url.endsWith('/access'))data=options.method==='POST'?{added:2,assigned:2,seat_limit:100}:{seat_limit:100,assigned:0,enforce_allowlist:true,access:[]};
    if(url==='/api/platform/overview')data={totals:{companies:1,members:3,votes:5},email_test_mode:true,organizations:[{...org,owner_email:'hr@demo.test',hr_link:'https://huddl.test/workspace?org=demo&view=admin',members:3,polls:1,votes:5,screens:1,screen_limit:2,seat_limit:100,seats_used:0,is_active:true,display_screens:[screen]}]};
    if(url==='/api/platform/organizations/org-1/send-portal')data={sent:true,email:'hr@demo.test',one_time_link:'https://huddl.test/workspace?org=demo&view=admin&invite=secret'};
    if(url==='/api/platform/organizations'&&options.method==='POST')data={slug:'new-company',email_sent:false,temporary_password:'temporary-secret-123',hr_email:'hr@example.com',hr_link:'https://huddl.test/workspace?org=new-company&view=admin'};
    return {ok:true,json:async()=>data};
  };
  w.eval(source);
  return {w,calls};
}

test('HR portal shows company theme, screen controls, and a save toast',async()=>{
  const {w,calls}=app();await tick();await tick();
  assert.equal(w.document.documentElement.style.getPropertyValue('--company-accent'),'#244f9b');
  assert.equal(w.document.querySelector('.ws-screen-list [name=name]').value,'Kitchen');
  assert.match(w.document.querySelector('.ws-screen-list .ws-screen-actions a').href,/screen=token-1/);
  assert.ok(w.document.querySelector('#change-email-request'));
  assert.equal(w.document.querySelector('#send-portal'),null);
  const access=w.document.querySelector('#access-import');
  access.querySelector('textarea').value='salma@company.com\nomar@company.com';
  access.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:access.querySelector('button')}));
  await tick();await tick();
  assert.deepEqual(JSON.parse(calls.find(x=>x.url==='/api/org/demo/access'&&x.options.method==='POST').options.body).emails,['salma@company.com','omar@company.com']);
  const form=w.document.querySelector('#brand-form');
  form.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:form.querySelector('button')}));
  await tick();await tick();
  assert.ok(calls.some(x=>x.url==='/api/org/demo/branding'&&x.options.method==='PATCH'));
  assert.match(w.document.querySelector('#huddl-toast').textContent,/Brand saved/);
  w.close();
});

test('employee joins from the HR email list without a verification message',async()=>{
  const dom=new JSDOM('<div id="app"></div>',{url:'https://huddl.test/workspace?org=demo&view=vote',runScripts:'outside-only'});
  const w=dom.window,calls=[];
  let joined=false;
  w.fetch=async(url,options={})=>{
    calls.push({url,options});
    if(url==='/api/org/demo/display')return {ok:true,json:async()=>({organization:{id:'org-1',slug:'demo',name:'Cairo Team',accent_color:'#244f9b'},poll:null})};
    if(url==='/api/me')return joined?{ok:true,json:async()=>({id:'member-1',org:'org-1',role:'employee',name:'Salma'})}:{ok:false,json:async()=>({error:'Sign in required'})};
    if(url==='/api/auth/join'){
      const data=JSON.parse(options.body);
      if(data.name)joined=true;
      return {ok:true,json:async()=>({profile_required:!joined,name:data.name})};
    }
    throw Error(`Unexpected request: ${url}`);
  };
  w.eval(source);await tick();await tick();
  const emailForm=w.document.querySelector('#email-form');
  emailForm.querySelector('[name=email]').value='salma@company.com';
  emailForm.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:emailForm.querySelector('button')}));
  await tick();await tick();
  assert.equal(w.document.querySelector('#profile-form').hidden,false);
  assert.equal(w.document.querySelector('#code-form'),null);
  const profile=w.document.querySelector('#profile-form');
  profile.querySelector('[name=name]').value='Salma';profile.querySelector('[name=department]').value='Design';
  profile.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:profile.querySelector('button')}));
  await tick();await tick();
  assert.equal(joined,true);
  assert.match(w.document.querySelector('.ws-auth h1').textContent,/No question yet/);
  assert.equal(calls.filter(x=>x.url==='/api/auth/join').length,2);
  assert.ok(!calls.some(x=>/auth\/(request|verify)/.test(x.url)));
  w.close();
});

test('Huddl owner generates company HR access and sees screen links',async()=>{
  const {w,calls}=app('platform');await tick();await tick();
  assert.match(w.document.querySelector('.platform-links').textContent,/1 active screen/);
  assert.match(w.document.querySelector('.platform-links a').href,/screen=token-1/);
  assert.match(w.document.querySelector('.platform-handoff a').href,/org=demo&view=admin/);
  assert.ok(w.document.querySelector('.copy-hr-link'));
  w.document.querySelector('.send-company-portal').click();await tick();await tick();
  assert.ok(calls.some(x=>x.url==='/api/platform/organizations/org-1/send-portal'&&x.options.method==='POST'));
  assert.match(w.document.querySelector('.one-time-access a').href,/invite=secret/);
  assert.match(w.document.querySelector('#huddl-toast').textContent,/Huddl test inbox/);
  assert.equal(w.document.querySelector('.platform-org [name=seat_limit]').value,'100');
  assert.equal(w.document.querySelector('.platform-org [name=screen_limit]').value,'2');
  const create=w.document.querySelector('#create-company');
  create.querySelector('[name=name]').value='New Company';create.querySelector('[name=slug]').value='new-company';create.querySelector('[name=admin_name]').value='HR';create.querySelector('[name=email]').value='hr@example.com';
  create.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:create.querySelector('button')}));
  await tick();await tick();
  assert.ok(calls.some(x=>x.url==='/api/platform/organizations'&&x.options.method==='POST'));
  assert.match(w.document.querySelector('.ws-credentials').textContent,/temporary-secret-123/);
  w.close();
});

test('office screen refreshes votes without rebuilding cards or QR code',async()=>{
  const dom=new JSDOM('<div id="app"></div>',{url:'https://huddl.test/workspace?org=demo&view=display',runScripts:'outside-only'});
  const w=dom.window,timers=[];
  const option={id:'option-1',label:'Koshary',votes:1};
  const poll={id:'poll-1',question:'Lunch today?',mode:'social',options:[option],people:[],total:1};
  let disconnected=false,qrCalls=0;
  w.QRCode={toString:async()=>{qrCalls++;return '<svg id="test-qr"></svg>'}};
  w.setTimeout=callback=>{timers.push(callback);return timers.length};
  w.clearTimeout=()=>{};
  w.fetch=async()=>{if(disconnected)throw Error('Network unavailable');return {ok:true,json:async()=>({organization:{id:'org-1',name:'Cairo Team',accent_color:'#244f9b',logo_data:null},poll})}};
  w.eval(source);await tick();await tick();
  const display=w.document.querySelector('.ws-display'),card=w.document.querySelector('.ws-results article'),qr=w.document.querySelector('#ws-qr');
  assert.ok(display&&card&&qr);
  option.votes=2;poll.total=2;poll.people=[{vote_id:'vote-1',option_id:'option-1',display_name:'Salma',department:'Design',job_title:'Designer',photo_data:null}];
  await timers.shift()();
  assert.equal(w.document.querySelector('.ws-display'),display);
  assert.equal(w.document.querySelector('.ws-results article'),card);
  assert.equal(w.document.querySelector('#ws-qr'),qr);
  assert.equal(w.document.querySelector('.ws-display-foot b').textContent,'2');
  assert.match(card.querySelector('.ws-people').textContent,/Salma/);
  assert.equal(qrCalls,1);
  const firstPerson=card.querySelector('.ws-people span');
  option.votes=3;poll.total=3;poll.people.unshift({vote_id:'vote-2',option_id:'option-1',display_name:'Omar',department:'Product',job_title:'Designer',photo_data:null});
  await timers.shift()();
  assert.equal(card.querySelectorAll('.ws-people span')[1],firstPerson);
  assert.equal(w.document.querySelector('.ws-display'),display);
  disconnected=true;await timers.shift()();
  assert.equal(w.document.querySelector('.ws-display'),display);
  assert.match(w.document.querySelector('.ws-refresh-error').textContent,/Reconnecting/);
  disconnected=false;await timers.shift()();
  assert.equal(w.document.querySelector('.ws-refresh-error'),null);
  assert.equal(w.document.querySelector('.ws-display'),display);
  w.close();
});
