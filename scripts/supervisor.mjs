import {spawn} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync,cpSync,rmSync,openSync,closeSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=resolve(process.env.ALIEN_ROOT??fileURLToPath(new URL('..',import.meta.url)));
const data=resolve(process.env.ALIEN_DATA??join(root,'data'));mkdirSync(data,{recursive:true,mode:0o700});
const pointer=join(data,'release.json'),request=join(data,'release-request.json'),lock=join(data,'supervisor.lock');
const baseline=join(root,'dist'),rescue=join(root,'.releases','rescue','dist');
const json=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
let release;try{release=existsSync(pointer)?json(pointer):{path:baseline,previous:baseline};}catch{release={path:rescue,previous:baseline};}
let child,modelChild,retryTimer,stopping=false,restarting=false,ticking=false,failures=0,started=Date.now(),opened=false,modelAttempts=0,lastFailure;
const port=Number(process.env.ALIEN_PORT??4317),url=`http://127.0.0.1:${port}`;
function openLink(){if(process.env.ALIEN_NO_OPEN==='1'||!existsSync(join(data,'access-token')))return;const link=url+'/#token='+readFileSync(join(data,'access-token'),'utf8');if(process.platform==='win32')spawn('rundll32',['url.dll,FileProtocolHandler',link],{stdio:'ignore',windowsHide:true});else if(process.platform==='darwin')spawn('open',[link],{stdio:'ignore'});}
function persist(){writeFileSync(pointer+'.tmp',JSON.stringify(release));renameSync(pointer+'.tmp',pointer);}
function status(extra={}){writeFileSync(join(data,'supervisor.json'),JSON.stringify({pid:process.pid,childPid:child?.pid,modelPid:modelChild?.pid,release:release.path,failures,lastFailure,updatedAt:new Date().toISOString(),...extra}));}
function permitted(path){if(typeof path!=='string')return false;const r=relative(root,resolve(path)).replaceAll('\\','/');return !r.startsWith('..')&&!isAbsolute(r)&&(resolve(path)===baseline||r.startsWith('.releases/'));}
function launch(){
  if(stopping)return;
  try{
    if(!permitted(release.path)||!existsSync(join(release.path,'server','main.js')))throw Error('Application release is unavailable');
    started=Date.now();child=spawn(process.execPath,[join(release.path,'server','main.js')],{cwd:root,env:{...process.env,ALIEN_ROOT:root,ALIEN_DATA:data,ALIEN_RELEASE_DIR:release.path,ALIEN_PORT:String(port)},stdio:'inherit',windowsHide:true});
    child.on('error',e=>{lastFailure=String(e);});
    child.on('close',(code,signal)=>{if(stopping||restarting)return;lastFailure=`Application exited: ${code??signal}`;failures++;recover();});status();
  }catch(e){lastFailure=String(e);failures++;recover();}
}
function recover(){
  if(stopping||retryTimer)return;
  if(failures>=3){
    const failed=release.path;
    release.path=release.path!==release.previous&&permitted(release.previous)&&existsSync(join(release.previous,'server','main.js'))?release.previous:existsSync(join(rescue,'server','main.js'))?rescue:baseline;
    if(failed!==release.path&&/\.releases[/\\][a-f0-9-]{36}$/.test(failed))writeFileSync(join(data,'repair-request.json'),JSON.stringify({candidateId:failed.split(/[/\\]/).at(-1),reason:lastFailure,createdAt:new Date().toISOString()}));
    persist();status({mode:'rollback'});
    if(failures>=6){console.error('恢复失败，已停止重启循环。查看本机日志。');void shutdown(1);return;}
  }
  retryTimer=setTimeout(()=>{retryTimer=undefined;launch();},Math.min(Math.max(failures,1)*2000,10000));
}
function stopProcess(proc){return new Promise(done=>{if(!proc||!proc.pid||proc.exitCode!==null||proc.signalCode!==null)return done();const timer=setTimeout(()=>proc.kill('SIGKILL'),10000);timer.unref();proc.once('close',()=>{clearTimeout(timer);done();});proc.kill('SIGTERM');});}
function startModel(){
  if(stopping||process.platform!=='win32'||modelChild||modelAttempts>=3||!existsSync(join(data,'model.json')))return;
  try{
    const model=json(join(data,'model.json'));
    if(typeof model.ModelPath!=='string'||!isAbsolute(model.ModelPath)||!existsSync(model.ModelPath)||!/^[a-zA-Z0-9._-]+$/.test(model.Distro)||!Number.isInteger(model.Context)||model.Context<2048||model.Context>65536)throw Error('Invalid local model configuration');
    modelAttempts++;
    modelChild=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'scripts','start-model.ps1'),'-ModelPath',model.ModelPath,'-Distro',model.Distro,'-Context',String(model.Context)],{cwd:root,stdio:'inherit',windowsHide:true});
    modelChild.on('error',e=>console.error('Local model:',e.message));
    modelChild.on('close',()=>{modelChild=undefined;if(!stopping&&modelAttempts<3)setTimeout(startModel,15000).unref();});
  }catch(e){modelAttempts=3;console.error('Local model:',String(e));}
}
async function inspectRequest(){
  if(!existsSync(request))return;
  const next=json(request);if(!/^[a-f0-9-]{36}$/.test(next.id))throw Error('Invalid candidate id');
  const dest=resolve(root,next.path);if(!permitted(dest)||relative(root,dest).replaceAll('\\','/')!==`.releases/${next.id}`)throw Error('Invalid candidate path');
  const manifest=json(join(dest,'manifest.json'));if(!Array.isArray(manifest.files)||!manifest.files.some(f=>f.path==='server/main.js'))throw Error('Incomplete candidate');
  for(const file of manifest.files){if(!/^(server|web)\//.test(file.path)||file.path.includes('..'))throw Error('Invalid manifest file');const hash=createHash('sha256').update(readFileSync(join(dest,file.path))).digest('hex');if(hash!==file.hash)throw Error('Candidate hash mismatch');}
  const token=readFileSync(join(data,'access-token'),'utf8');const current=await fetch(url+'/api/state',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(5000)}).then(r=>r.json());
  if(current.tasks.some(t=>t.status==='running'))return;
  restarting=true;try{await stopProcess(child);release={path:dest,previous:release.path};persist();renameSync(request,request+'.applied-'+Date.now());failures=0;launch();}finally{restarting=false;}
}
async function tick(){
  if(stopping||restarting||ticking||retryTimer)return;ticking=true;
  try{
    const r=await fetch(url+'/health',{signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error('Unhealthy');
    if(Date.now()-started>120000)failures=0;status({mode:'healthy'});
    if(!opened){opened=true;console.log(`Alien 已启动：${url}。访问密钥位于本机 data/access-token。`);openLink();}
    try{await inspectRequest();}catch(e){if(existsSync(request))renameSync(request,request+'.rejected-'+Date.now());status({mode:'healthy',releaseError:String(e)});}
  }catch(e){status({mode:'recovering',error:String(e)});if(Date.now()-started>90000){restarting=true;await stopProcess(child);restarting=false;failures++;recover();}}
  finally{ticking=false;}
}
async function shutdown(code=0){if(stopping)return;stopping=true;clearInterval(timer);clearTimeout(retryTimer);await Promise.all([stopProcess(child),stopProcess(modelChild)]);rmSync(lock,{force:true});rmSync(join(data,'supervisor.json'),{force:true});process.exit(code);}
if(process.argv.includes('--snapshot')){
  mkdirSync(join(root,'.releases','rescue'),{recursive:true});cpSync(baseline,rescue,{recursive:true});
  if(existsSync(join(root,'node_modules')))cpSync(join(root,'node_modules'),join(root,'.releases','rescue','node_modules'),{recursive:true,dereference:true});
  console.log('独立救援版本已保存');process.exit(0);
}
try{const fd=openSync(lock,'wx');writeFileSync(fd,String(process.pid));closeSync(fd);}
catch{
  const pid=Number(existsSync(lock)?readFileSync(lock,'utf8'):0);let live=false;try{if(pid>0){process.kill(pid,0);live=true;}}catch{}
  if(live){console.log('Alien 已在运行。');openLink();process.exit(0);}
  rmSync(lock,{force:true});const fd=openSync(lock,'wx');writeFileSync(fd,String(process.pid));closeSync(fd);
}
const timer=setInterval(()=>void tick(),5000);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void shutdown());
launch();startModel();void tick();
