import { Resend } from 'resend';

const unavailable=()=>Object.assign(new Error('Email delivery is not configured'),{status:503});
const deliveryFailure=()=>Object.assign(new Error('Could not deliver email'),{status:502});

export function emailTestMode(){return !process.env.BREVO_API_KEY&&!!process.env.EMAIL_TEST_RECIPIENT}

export async function sendMail({to,subject,text,attachments=[]}){
  if(process.env.BREVO_API_KEY){
    const sender=process.env.BREVO_SENDER_EMAIL;
    if(!sender)throw unavailable();
    const response=await fetch('https://api.brevo.com/v3/smtp/email',{
      method:'POST',
      headers:{'api-key':process.env.BREVO_API_KEY,'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({sender:{name:'Huddl',email:sender},to:[{email:to}],subject,textContent:text,...(attachments.length?{attachment:attachments.map(file=>({name:file.filename,content:Buffer.isBuffer(file.content)?file.content.toString('base64'):file.content}))}:{})}),
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok)throw deliveryFailure();
    return {recipient:to,test_mode:false};
  }
  if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)throw unavailable();
  const recipient=process.env.EMAIL_TEST_RECIPIENT||to;
  const result=await new Resend(process.env.RESEND_API_KEY).emails.send({from:process.env.EMAIL_FROM,to:recipient,subject,text,attachments:attachments.map(file=>({filename:file.filename,content:Buffer.isBuffer(file.content)?file.content.toString('base64'):file.content}))});
  if(result.error)throw deliveryFailure();
  return {recipient,test_mode:emailTestMode()};
}
