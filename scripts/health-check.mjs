const endpoint='https://huddl-place.vercel.app/api/health';
let healthy=false;
for(let attempt=1;attempt<=3;attempt++){
  try{const response=await fetch(endpoint,{signal:AbortSignal.timeout(12000),cache:'no-store'});const body=await response.json();if(response.ok&&body.ok===true){healthy=true;break}}catch{}
  if(attempt<3)await new Promise(resolve=>setTimeout(resolve,10000));
}
if(!healthy){console.error('Huddl health check failed after three attempts');process.exitCode=1}else console.log('Huddl application and database health check passed');
