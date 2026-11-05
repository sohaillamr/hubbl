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
    if(url==='/api/me')data={id:'member-1',org:org.id,role:'owner',name:'Nour',platform:true};
    if(url.endsWith('/metrics'))data={members:3,polls:[]};
    if(url.endsWith('/polls'))data={polls:[]};
    if(url.endsWith('/members'))data={members:[]};
    if(url.endsWith('/display'))data={organization:org,poll:null};
    if(url.endsWith('/screens'))data={screens:[screen]};
    if(url==='/api/platform/overview')data={totals:{companies:1,members:3,votes:5},organizations:[{...org,members:3,polls:1,votes:5,screens:1,is_active:true,display_screens:[screen]}]};
    return {ok:true,json:async()=>data};
  };
  w.eval(source);
  return {w,calls};
}

test('HR portal shows company theme, screen controls, and a save toast',async()=>{
  const {w,calls}=app();await tick();await tick();
  assert.equal(w.document.documentElement.style.getPropertyValue('--company-accent'),'#244f9b');
  assert.equal(w.document.querySelector('.ws-screen-list [name=name]').value,'Kitchen');
  assert.match(w.document.querySelector('.ws-screen-actions a').href,/screen=token-1/);
  const form=w.document.querySelector('#brand-form');
  form.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:form.querySelector('button')}));
  await tick();await tick();
  assert.ok(calls.some(x=>x.url==='/api/org/demo/branding'&&x.options.method==='PATCH'));
  assert.match(w.document.querySelector('#huddl-toast').textContent,/Brand saved/);
  w.close();
});

test('Huddl owner sees company screen count and portal email action',async()=>{
  const {w,calls}=app('platform');await tick();await tick();
  assert.match(w.document.querySelector('.platform-links').textContent,/1 active screen/);
  assert.match(w.document.querySelector('.platform-links a').href,/screen=token-1/);
  w.document.querySelector('.send-company-portal').click();await tick();await tick();
  assert.ok(calls.some(x=>x.url==='/api/platform/organizations/org-1/send-portal'&&x.options.method==='POST'));
  w.close();
});
