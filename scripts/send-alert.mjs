const key=process.env.BREVO_API_KEY,email=process.env.ALERT_EMAIL;
if(!key||!email)throw Error('Alert delivery is not configured');
const title=String(process.argv[2]||'Huddl operations alert').slice(0,100);
const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':key,'Content-Type':'application/json'},body:JSON.stringify({sender:{name:'Huddl',email},to:[{email}],subject:title,textContent:`${title}. Open the Huddl repository Actions tab for the run details. This alert contains no employee data.`}),signal:AbortSignal.timeout(15000)});
if(!response.ok)throw Error(`Alert email was rejected (HTTP ${response.status})`);
console.log('Alert accepted by the email provider');
