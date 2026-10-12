// Smoke-test the actual ZIP artifacts from `netlify build --offline`.
// Uses isolated local data and never connects to a cloud account.
import {mkdir,readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import assert from 'node:assert/strict';
import yauzl from 'yauzl';
import archiver from 'archiver';
import {PGlite} from '@electric-sql/pglite';
const run=promisify(execFile),base=process.cwd();
const manifest=JSON.parse(await readFile('.netlify/functions/manifest.json','utf8'));
assert.equal(manifest.functions.length,5);
for(const fn of manifest.functions)assert.equal(fn.buildData.runtimeAPIVersion,2,fn.name+' must use the modern Netlify runtime');
await mkdir('.netlify',{recursive:true});
const folder=await mkdtemp(path.join(base,'.netlify','verify-'));
async function unpack(name){
  const dest=path.join(folder,name);await mkdir(dest);
  const zip=await new Promise((resolve,reject)=>yauzl.open(path.join(base,'.netlify/functions',name+'.zip'),{lazyEntries:true},(e,z)=>e?reject(e):resolve(z)));
  let root;
  await new Promise((resolve,reject)=>{
    zip.on('error',reject);zip.on('end',resolve);
    zip.on('entry',async entry=>{try{
      const target=path.resolve(dest,entry.fileName);
      if(!target.startsWith(dest+path.sep))throw new Error('Unsafe ZIP entry');
      if(entry.fileName.endsWith('/'))await mkdir(target,{recursive:true});
      else{await mkdir(path.dirname(target),{recursive:true});const stream=await new Promise((r,j)=>zip.openReadStream(entry,(e,s)=>e?j(e):r(s)));await pipeline(stream,createWriteStream(target));}
      if(entry.fileName.endsWith('server/migrations/001_initial.sql'))root=path.resolve(path.dirname(target),'../..');
      zip.readEntry();
    }catch(e){reject(e);}});zip.readEntry();
  });
  assert.ok(root,'migration included');
  return {dest,root};
}
const page=await unpack('page'),api=await unpack('api'),background=await unpack('import-background');
async function invoke(artifact,name,event,dataDir){
  const env={...process.env,DATA_DIR:dataDir,SETUP_KEY:'artifact-smoke-only'};
  for(const key of ['NETLIFY','AWS_LAMBDA_FUNCTION_NAME','DATABASE_URL','NETLIFY_DB_URL','NETLIFY_DB_DRIVER','TEYVAT_PROJECT_ROOT'])delete env[key];
  const code="import {pathToFileURL} from 'node:url';const {default:handler}=await import(pathToFileURL(process.argv[2]));const event=JSON.parse(process.argv[3]);const request=new Request('https://artifact.test'+(event.path||'/.netlify/functions/import-background'),{method:event.httpMethod||(event.body?'POST':'GET'),headers:{host:'artifact.test','content-type':'application/json',...event.headers},...(event.body?{body:event.body}:{})});const r=await handler(request,{requestId:'zip-smoke',ip:'127.0.0.1'});console.log(JSON.stringify({statusCode:r.status,body:await r.text()}));process.exit(0);";
  const runner=path.join(artifact.dest,'verify-runner.mjs');await writeFile(runner,code);
  const out=await run(process.execPath,[runner,path.join(artifact.root,'netlify/functions',name+'.mjs'),JSON.stringify(event)],{cwd:artifact.dest,env,maxBuffer:2*1024*1024,timeout:90000});
  return JSON.parse(out.stdout.trim());
}
const res=await invoke(page,'page',{path:'/characters/missing',queryStringParameters:{}},path.join(folder,'page-data'));
assert.equal(res.statusCode,404);assert.match(res.body,/<!doctype html>/i);
const status=await invoke(api,'api',{path:'/api/status',httpMethod:'GET',headers:{},requestContext:{identity:{sourceIp:'127.0.0.1'}},queryStringParameters:{}},path.join(folder,'api-data'));
assert.equal(status.statusCode,200);assert.equal(JSON.parse(status.body).needsSetup,true);
const setup=await invoke(api,'api',{path:'/api/setup',httpMethod:'POST',body:JSON.stringify({username:'zip_smoke',password:'artifact-test-passphrase',includeSample:false})},path.join(folder,'api-data'));
assert.equal(setup.statusCode,200,setup.body);assert.equal(JSON.parse(setup.body).user.role,'owner');
const data=path.join(folder,'import-data');await mkdir(path.join(data,'files'),{recursive:true});
const chunks=[],archive=archiver('zip');archive.on('data',b=>chunks.push(b));
archive.append('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',{name:'[Content_Types].xml'});
archive.append('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>武器推荐</w:t></w:r></w:p><w:p><w:r><w:t>测试武器｜用于验证打包解析。</w:t></w:r></w:p></w:body></w:document>',{name:'word/document.xml'});
await archive.finalize();const source=Buffer.concat(chunks);await writeFile(path.join(data,'files','source'),source);
let db=new PGlite(path.join(data,'postgres'));await db.waitReady;
for(const sql of (await readFile(path.join(background.root,'server/migrations/001_initial.sql'),'utf8')).split(';').filter(s=>s.trim()))await db.query(sql);
await db.query("INSERT INTO users(id,username,display_name,password_hash,role) VALUES('owner','artifact','验收','unused','owner')");
await db.query("INSERT INTO assets(id,owner_id,filename,mime,kind,size) VALUES('source','owner','test.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','source',$1)",[source.length]);
await db.query("INSERT INTO imports(id,owner_id,asset_id,fingerprint,status) VALUES('job','owner','source','fixture','queued')");await db.close();
const job=await invoke(background,'import-background',{headers:{'x-task-key':'artifact-smoke-only'},body:'{"id":"job"}'},data);assert.equal(job.statusCode,200);
db=new PGlite(path.join(data,'postgres'));await db.waitReady;const record=(await db.query("SELECT status,text,error FROM imports WHERE id='job'")).rows[0];await db.close();
assert.equal(record.status,'review',record.error);assert.match(record.text,/测试武器/);
console.log('Netlify ZIP 运行验证通过：全部函数为 runtime 2；API/JSON 初始化、SEO 模板/迁移、后台 DOCX 解析线程。');
