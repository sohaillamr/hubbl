import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { suggestQuestions } from '../api/ai.js';
import { buildVoteReport } from '../api/report.js';

test('AI suggestions use company context and validate usable choices',async()=>{
  let request;
  const fetcher=async(_url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({questions:[{question:'What does our Tuesday policy allow?',options:['Remote work','No lunch'],mode:'anonymous',rationale:'Remote work on Tuesday.'}]})}}]})}};
  const questions=await suggestQuestions({key:'test-key',company:'Cairo Team',description:'A product studio',policy:'Remote work is allowed on Tuesdays.',kind:'policy',language:'en',fetcher});
  assert.equal(questions[0].mode,'anonymous');
  assert.match(request.messages[1].content,/Tuesdays/);
  assert.equal(request.response_format.json_schema.strict,true);
  await assert.rejects(()=>suggestQuestions({key:'test-key',company:'Cairo Team',kind:'policy',fetcher}),/Upload or paste/);
});

test('vote PDF includes consented names and keeps private votes anonymous',async()=>{
  const pdf=await buildVoteReport({company:'Cairo Team',timezone:'Africa/Cairo',question:'Tea or coffee?',mode:'social',options:[{id:'tea',label:'Tea'},{id:'coffee',label:'Coffee'}],votes:[{option_id:'tea',show_identity:true,display_name:'Salma',department:'Design',created_at:new Date()},{option_id:'coffee',show_identity:false,display_name:'Omar',department:'Finance',created_at:new Date()}]});
  assert.equal(pdf.subarray(0,4).toString(),'%PDF');
  const document=await getDocument({data:new Uint8Array(pdf)}).promise;
  const page=await document.getPage(1);
  const text=(await page.getTextContent()).items.map(item=>item.str).join(' ');
  assert.match(text,/Salma/);
  assert.match(text,/private vote/);
  assert.doesNotMatch(text,/Omar/);
});
