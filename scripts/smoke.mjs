import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
const data=mkdtempSync(join(tmpdir(),'alien-smoke-')),port=4339,url=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['scripts/supervisor.mjs'],{env:{...process.env,ALIEN_DATA:data,ALIEN_PORT:String(port),ALIEN_NO_OPEN:'1'},stdio:'inherit'});
const end=Date.now()+30000;
try{
  while(true){try{const r=await fetch(url+'/health');if(r.ok)break;}catch{}if(Date.now()>end)throw Error('Server not ready');await new Promise(r=>setTimeout(r,100));}
  const token=readFileSync(join(data,'access-token'),'utf8');const response=await fetch(url+'/api/state',{headers:{Authorization:'Bearer '+token}});const state=await response.json();
  if(!response.ok||!state.skills.length)throw Error('Built server did not expose state and bundled skills');
  if((await fetch(url+'/api/state')).status!==401)throw Error('Unauthenticated API request was not rejected');
  const html=await fetch(url).then(r=>r.text());if(!html.includes('id="root"'))throw Error('Built GUI not served');
  const t=await fetch(url+'/api/tasks',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({goal:'Smoke test'})});if(!t.ok)throw Error('Task enqueue failed');
  console.log('Built GUI, authenticated API, task queue and supervisor started successfully.');
}finally{
  if(process.platform==='win32'){
    const stopped=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});await new Promise(r=>stopped.once('close',r));
  }else{child.kill('SIGTERM');await new Promise(r=>child.once('close',r));}
  await new Promise(r=>setTimeout(r,200));rmSync(data,{recursive:true,force:true});
}
