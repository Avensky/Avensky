// Compare the initial static JavaScript closure using the same installed assets
// and Vite configuration. Public binaries are not regenerated or copied.
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, writeFile, rm, mkdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {build} from 'vite';

const frontend=fileURLToPath(new URL('../',import.meta.url)),repo=resolve(frontend,'..');
const option=name=>{const at=process.argv.indexOf(name);return at===-1?undefined:process.argv[at+1];};
const baseline=option('--baseline'), output=option('--output'), mode=option('--mode') ?? 'production';
if(!baseline||!output)throw Error('Use --baseline <git-ref> --output <report.json> [--mode staging]');
execFileSync('git',['rev-parse','--verify',baseline+'^{commit}'],{cwd:repo,stdio:'ignore'});
const originals=new Map();
const paths=execFileSync('git',['diff','--name-only',baseline,'--','frontend/src','packages'],{cwd:repo,encoding:'utf8'})
  .trim().split('\n').filter(path=>/\.(tsx?|jsx?|json)$/.test(path));
for(const path of paths){
  try { originals.set(resolve(repo,path),execFileSync('git',['show',baseline+':'+path],{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','ignore']})); }
  catch { /* A new module has no imports in the baseline source graph. */ }
}
const temporary=await mkdtemp(resolve(tmpdir(),'avenlab-bundle-'));
async function measure(name,restore){
 const outDir=resolve(temporary,name);
 const colliderChunks = new Set();
 const auditColliders = {
  name: 'audit-world-colliders',
  generateBundle(_, bundle) {
   for (const chunk of Object.values(bundle)) {
    if (chunk.type === 'chunk' && Object.keys(chunk.modules).some(id =>
     id.endsWith('/assets/models/commercial-buildings.json') || id.endsWith('/assets/roads/road-colliders.json')))
     colliderChunks.add(chunk.fileName);
   }
  },
 };
 await build({root:frontend,mode,plugins:[auditColliders,restore && {
  name:'audit-baseline-source',enforce:'pre',
  transform(source,id){return originals.get(id.split('?')[0])??source;},
 }],build:{outDir,emptyOutDir:true,copyPublicDir:false,manifest:true}});
 const manifest=JSON.parse(await readFile(resolve(outDir,'.vite/manifest.json'),'utf8'));
 const entry=manifest['index.html'];
 if(!entry)throw Error('The game entry is missing from the Vite manifest');
 const seen=new Set(),files=[];
 async function visit(key){
  if(seen.has(key))return;seen.add(key);
  const item=manifest[key];if(!item)throw Error('Missing manifest dependency '+key);
  const bytes=await readFile(resolve(outDir,item.file));
  files.push({path:item.file,bytes:bytes.length,gzipBytes:gzipSync(bytes).length});
  for(const dependency of item.imports??[])await visit(dependency);
 }
 await visit('index.html');
 const optional={};
 for(const key of ['src/game/alpha/HeroSelection.tsx','src/game/heroes/HeroWorkshop.tsx']){
  const item=manifest[key];
  if(item){const bytes=await readFile(resolve(outDir,item.file));optional[key]={path:item.file,bytes:bytes.length,gzipBytes:gzipSync(bytes).length,inInitialClosure:seen.has(key)};}
 }
 const initialFiles = files.slice();
 if (manifest['src/game/GameUI.tsx']) await visit('src/game/GameUI.tsx');
 return {
  initialJavaScriptBytes: initialFiles.reduce((sum, item) => sum + item.bytes, 0),
  initialJavaScriptGzipBytes: initialFiles.reduce((sum, item) => sum + item.gzipBytes, 0),
  throughMainJavaScriptGzipBytes: files.reduce((sum, item) => sum + item.gzipBytes, 0),
  worldColliderChunksThroughMain: files.filter(item => colliderChunks.has(item.path)).map(item => item.path),
  files: initialFiles,
  optional,
 };
}
try {
 const before=await measure('baseline',true),after=await measure('current',false);
 const report={baseline,mode,method:'Same current Vite configuration and installed public assets; baseline source restored before transforms. Static import closures of index.html and the main menu; Node zlib default gzip. No transfer/FPS measurements.',before,after};
 await mkdir(dirname(resolve(output)),{recursive:true});
 await writeFile(output,JSON.stringify(report,null,2)+'\n');
 if(after.worldColliderChunksThroughMain.length)throw Error('World collider geometry loaded before entering gameplay: '+after.worldColliderChunksThroughMain.join(', '));
 console.log(JSON.stringify({output,before:before.initialJavaScriptGzipBytes,after:after.initialJavaScriptGzipBytes}));
}finally{await rm(temporary,{recursive:true,force:true});}
