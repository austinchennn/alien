import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
const version=Number(process.versions.node.split('.')[0]);
console.log('Alien 环境检查');
console.log('Node.js:',process.version,version>=22?'OK':'需要 Node.js 22.19+');
console.log('应用构建:',existsSync('dist/server/main.js')?'OK':'请运行 npm run build');
console.log('操作系统:',process.platform,process.arch);
for(const command of process.platform==='win32'?['wsl.exe']:['podman','docker']){const r=spawnSync(command,['--version'],{encoding:'utf8',shell:false});console.log(command+':',r.status===0?r.stdout.trim():'未检测到');}
try{const r=await fetch('http://127.0.0.1:8000/v1/models',{signal:AbortSignal.timeout(3000),redirect:'error'});console.log('本地模型:',r.ok?JSON.stringify(await r.json()):r.status);}catch{console.log('本地模型: 尚未启动（模型不随应用下载）');}
console.log('数据目录:',process.env.ALIEN_DATA??join(process.cwd(),'data'));
