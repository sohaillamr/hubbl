import { PDFDocument } from 'pdfkit';
import { readFileSync } from 'node:fs';

const when=(date,timezone)=>new Intl.DateTimeFormat('en-EG',{timeZone:timezone||'Africa/Cairo',dateStyle:'medium',timeStyle:'short'}).format(new Date(date));

export async function buildVoteReport({company,timezone,question,mode,options,votes}){
  const doc=new PDFDocument({size:'A4',margin:48,bufferPages:true,info:{Title:`Huddl vote report - ${company}`,Author:'Huddl'}});
  const chunks=[];doc.on('data',chunk=>chunks.push(chunk));
  const done=new Promise((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
  doc.registerFont('Cairo',readFileSync(new URL('../fonts/Cairo.ttf',import.meta.url)));
  doc.font('Cairo').fillColor('#20201d').fontSize(28).text('huddl.');
  doc.fontSize(11).fillColor('#666666').text('VOTE REPORT  /  '+company);
  doc.moveDown(.7).fillColor('#20201d').fontSize(18).text(question);
  doc.moveDown(.4).fontSize(10).fillColor('#666666').text(`Generated ${when(new Date(),timezone)}  |  ${votes.length} votes`);
  doc.moveDown(1).fillColor('#20201d').fontSize(14).text('Results');
  for(const option of options){const count=votes.filter(v=>v.option_id===option.id).length;doc.fontSize(11).text(`${option.label}  —  ${count} votes`,{lineGap:3})}
  doc.moveDown(1).fontSize(14).text('Participants');
  const named=mode==='social'?votes.filter(v=>v.show_identity):[];
  if(!named.length)doc.fontSize(10).fillColor('#666666').text('No voters chose to appear by name.');
  for(const vote of named){
    const label=options.find(o=>o.id===vote.option_id)?.label||'Choice unavailable';
    doc.fontSize(10).fillColor('#20201d').text(`${vote.display_name}  ·  ${vote.department||vote.job_title||'Team'}`,{continued:false});
    doc.fillColor('#666666').text(`${label}  ·  ${when(vote.created_at,timezone)}`);
    doc.moveDown(.35);
  }
  const privateCount=votes.length-named.length;
  if(privateCount)doc.moveDown(.5).fontSize(9).fillColor('#666666').text(`${privateCount} private vote${privateCount===1?'':'s'} included in totals without names or individual timestamps.`);
  doc.end();return done;
}
