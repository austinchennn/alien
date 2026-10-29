import {cpSync,mkdirSync,readdirSync,lstatSync,copyFileSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
const work='/tmp/alien-evaluation';mkdirSync(work,{recursive:true});cpSync('/base',work,{recursive:true});
function overlay(dir){for(const name of readdirSync(dir)){const path=join(dir,name),stat=lstatSync(path);if(stat.isSymbolicLink())throw Error('Symlink rejected');if(stat.isDirectory())overlay(path);else{const rel=relative('/candidate',path).replaceAll('\\','/');if(!/^src\/runtime\/[a-zA-Z0-9_-]+\.ts$/.test(rel)&&!/^web\/src\/[a-zA-Z0-9_-]+\.(tsx|ts|css)$/.test(rel))throw Error('Protected path: '+rel);const dest=join(work,rel);mkdirSync(join(dest,'..'),{recursive:true});copyFileSync(path,dest);}}}
overlay('/candidate');
for(const command of ['check','test','build']){const result=spawnSync('npm',['run',command],{cwd:work,env:{...process.env,HOME:'/tmp',ALIEN_EVALUATING:'1'},encoding:'utf8',timeout:150000,maxBuffer:4*1024*1024});process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');if(result.status!==0)process.exit(1);}
cpSync(join(work,'dist'),'/output',{recursive:true});
