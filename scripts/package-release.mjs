import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const dest=resolve(process.argv[2]??'release');mkdirSync(dest,{recursive:true});
const stage=mkdtempSync(join(tmpdir(),'alien-package-')),app=join(stage,'alien');mkdirSync(app);
const files=['src','web','scripts','sandbox','skills','tests','docs','README.md','LICENSE','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','playwright.config.ts','Install-Alien.cmd','setup.cmd','start.cmd','Prepare-Sandbox.cmd','Configure-Model.cmd','Install-Browser.cmd'];
for(const file of files)cpSync(file,join(app,file),{recursive:true});
function normalize(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const p=join(dir,entry.name);if(entry.isDirectory())normalize(p);else if(/\.(cmd|ps1)$/.test(p))writeFileSync(p,readFileSync(p,'utf8').replace(/\r?\n/g,'\r\n'));}}
normalize(app);const archive=join(dest,'Alien-Windows.zip');
const result=spawnSync('python3',['-c','import shutil,sys;shutil.make_archive(sys.argv[1],"zip",sys.argv[2])',archive.slice(0,-4),stage],{stdio:'inherit'});if(result.status!==0)throw Error('Archive creation failed');
const installer=readFileSync(join(app,'Install-Alien.cmd'));writeFileSync(join(dest,'Install-Alien.cmd'),installer);
const hashes=['Alien-Windows.zip','Install-Alien.cmd'].map(name=>createHash('sha256').update(readFileSync(join(dest,name))).digest('hex')+'  '+name).join('\n')+'\n';writeFileSync(join(dest,'SHA256SUMS.txt'),hashes);rmSync(stage,{recursive:true,force:true});console.log('Release packaged without model weights, credentials, data or node_modules.');
