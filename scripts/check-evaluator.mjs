import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'alien-evaluator-'));mkdirSync(join(dir,'input','src','runtime'),{recursive:true});mkdirSync(join(dir,'output'));
try{
  writeFileSync(join(dir,'input','src','runtime','context.ts'),readFileSync('src/runtime/context.ts'));
  const r=spawnSync('docker',['run','--rm','--user',`${process.getuid()}:${process.getgid()}`,'--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=256','--memory=2g','--cpus=2','--tmpfs=/tmp:rw,exec,nosuid,size=768m','-v',`${dir}/input:/candidate:ro`,'-v',`${dir}/output:/output:rw`,'localhost/alien-evaluator:0.1.0'],{stdio:'inherit',timeout:300000});
  if(r.status!==0||!existsSync(join(dir,'output','server','main.js'))||!existsSync(join(dir,'output','web','index.html')))throw Error('Independent candidate evaluator failed');
  console.log('Independent image completed protected type checks, regression tests and build.');
}finally{rmSync(dir,{recursive:true,force:true});}
