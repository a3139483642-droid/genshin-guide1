import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import archiver from 'archiver';
for(const key of ['NETLIFY','AWS_LAMBDA_FUNCTION_NAME','DATABASE_URL','NETLIFY_DB_URL','NETLIFY_DB_DRIVER','TEYVAT_PROJECT_ROOT'])delete process.env[key];
process.env.DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'teyvat-test-'));
const {app}=await import('../server/app.mjs');
const {database,one,rows}=await import('../server/db.mjs');
const {sampleGuide}=await import('../server/seed.mjs');
const {extract,detect,structure}=await import('../server/parser.mjs');
const {exportBackup,restoreInto}=await import('../server/backup.mjs');
const {seoCharacter}=await import('../server/seo.mjs');
const owner=request.agent(app),publisher=request.agent(app),other=request.agent(app),visitor=request.agent(app),anonymous=request(app);
let ownerCsrf,pubCsrf,otherCsrf,userCsrf,publisherId,planId,revision,versionId,sourceId,imageId;
const pw='Test-only-passphrase-2026!';
const action=(agent,method,url,token,body)=>agent[method]('/api'+url).set('X-CSRF-Token',token).send(body);
after(async()=>{await (await database()).close();});
test('full-stack acceptance',async t=>{
 await t.test('initialization is unique; registration cannot escalate role; CSRF protected',async()=>{
  assert.equal((await anonymous.get('/api/status')).body.needsSetup,true);
  const init=await owner.post('/api/setup').send({username:'keeper',displayName:'测试站长',password:pw,includeSample:false});assert.equal(init.status,200,JSON.stringify(init.body));ownerCsrf=init.body.csrf;
  assert.equal((await anonymous.post('/api/setup').send({username:'another',password:pw})).status,409);
  const reg=await visitor.post('/api/register').send({username:'traveler',password:pw,role:'owner'});assert.equal(reg.body.user.role,'user');userCsrf=reg.body.csrf;
  assert.equal((await owner.put('/api/owner/settings').send({name:'bad',description:''})).status,403);
  assert.equal((await action(visitor,'post','/admin/plans',userCsrf,{})).status,403);
  assert.equal((await owner.get('/api/me')).body.user.role,'owner');
 });
 await t.test('publisher invitation and per-object isolation',async()=>{
  for(const username of ['publisher','other'])assert.equal((await action(owner,'post','/owner/users',ownerCsrf,{username,password:pw,displayName:username})).status,200);
  const a=await publisher.post('/api/login').send({username:'publisher',password:pw});pubCsrf=a.body.csrf;publisherId=a.body.user.id;
  const b=await other.post('/api/login').send({username:'other',password:pw});otherCsrf=b.body.csrf;
  const draft=await action(publisher,'post','/admin/plans',pubCsrf,{characterId:'kazuha',data:sampleGuide()});assert.equal(draft.status,200,JSON.stringify(draft.body));planId=draft.body.id;
  assert.equal((await other.get('/api/admin/plans/'+planId)).status,404);
  assert.equal((await anonymous.get('/api/plans/'+planId)).status,404);
  assert.equal((await publisher.get('/api/owner/users')).status,403);
  assert.equal((await publisher.get('/api/admin/plans/'+planId)).body.revision,1);revision=1;
 });
 await t.test('imports preserve text and unknown content; original file private; deduplication',async()=>{
  const text='不完整来源：测试者\n武器推荐：\n铁蜂刺｜条件未注明\n圣遗物：\n翠绿之影四件套\n词条选择：\n时之沙：元素精通\n配队方案：\n角色甲｜辅助\n操作循环：\n第一步：按原文执行';
  const upload=await publisher.post('/api/admin/imports').set('X-CSRF-Token',pubCsrf).attach('file',Buffer.from(text),'sample.md');assert.equal(upload.status,200,JSON.stringify(upload.body));
  let job;for(let i=0;i<100;i++){job=(await publisher.get('/api/admin/imports/'+upload.body.id)).body;if(['review','failed'].includes(job.status))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(job.status,'review',JSON.stringify(job));assert.ok(job.result.modules.some(m=>m.type==='weapons'));assert.ok(job.result.modules.some(m=>m.type==='teams'));assert.ok(job.result.modules.some(m=>m.type==='rotation'));assert.equal(job.result.unassigned[0].text,'不完整来源：测试者');sourceId=job.asset_id;
  assert.equal((await anonymous.get('/api/assets/'+sourceId)).status,401);assert.equal((await other.get('/api/assets/'+sourceId)).status,404);assert.equal((await publisher.get('/api/assets/'+sourceId)).status,200);
  const duplicate=await publisher.post('/api/admin/imports').set('X-CSRF-Token',pubCsrf).attach('file',Buffer.from(text),'again.md');assert.equal(duplicate.body.id,job.id);assert.equal(duplicate.body.duplicate,true);
 });
 await t.test('image storage visibility follows published module references',async()=>{
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1kAAAAASUVORK5CYII=','base64');
  const out=await publisher.post('/api/admin/images').set('X-CSRF-Token',pubCsrf).attach('file',png,'tiny.png');assert.equal(out.status,200);imageId=out.body.id;
  assert.equal((await anonymous.get('/api/assets/'+imageId)).status,401);
  const data=sampleGuide();data.modules[0].assetIds=[imageId];const save=await action(publisher,'put','/admin/plans/'+planId,pubCsrf,{data,revision});assert.equal(save.status,200,JSON.stringify(save.body));revision=save.body.revision;
  assert.equal((await action(publisher,'delete','/admin/assets/'+imageId,pubCsrf)).status,409);
  assert.equal((await action(publisher,'put','/admin/plans/'+planId,pubCsrf,{data,revision:1})).status,409);
 });
 await t.test('publisher publishes immediately but cannot change published plans; source stays private',async()=>{
  const out=await action(publisher,'post','/admin/plans/'+planId+'/publish',pubCsrf,{confirmed:true,revision});assert.equal(out.status,200,JSON.stringify(out.body));
  const plan=await anonymous.get('/api/plans/'+planId);assert.equal(plan.status,200);versionId=plan.body.versionId;
  assert.equal((await anonymous.get('/api/assets/'+imageId)).status,200);assert.equal((await anonymous.get('/api/assets/'+sourceId)).status,401);
  assert.equal((await action(publisher,'put','/admin/plans/'+planId,pubCsrf,{data:sampleGuide(),revision:3})).status,403);
  assert.equal((await action(publisher,'post','/admin/plans/'+planId+'/unlist',pubCsrf,{})).status,403);
  assert.equal((await action(publisher,'delete','/admin/plans/'+planId,pubCsrf)).status,403);
  assert.equal((await anonymous.get('/api/characters?ready=true')).body.total,1);
 });
 await t.test('likes are idempotent under concurrent requests and reversible',async()=>{
  const results=await Promise.all(Array.from({length:8},()=>action(visitor,'put','/plans/'+planId+'/like',userCsrf,{liked:true})));results.forEach(r=>assert.equal(r.status,200));
  assert.equal((await visitor.get('/api/plans/'+planId+'/feedback')).body.likes,1);
  await action(visitor,'put','/plans/'+planId+'/like',userCsrf,{liked:false});assert.equal((await visitor.get('/api/plans/'+planId+'/feedback')).body.likes,0);
 });
 await t.test('ratings upsert and removal preserve counts',async()=>{
  for(const stars of [5,3])assert.equal((await action(visitor,'put','/plans/'+planId+'/rating',userCsrf,{stars,versionId})).status,200);
  const feedback=(await visitor.get('/api/plans/'+planId+'/feedback')).body;assert.equal(feedback.rating.count,1);assert.equal(Number(feedback.rating.average),3);
  await action(visitor,'put','/plans/'+planId+'/rating',userCsrf,{stars:0,versionId});assert.equal((await visitor.get('/api/plans/'+planId+'/feedback')).body.rating.count,0);
  await action(visitor,'put','/plans/'+planId+'/rating',userCsrf,{stars:4,versionId});
 });
 await t.test('comments, replies, duplicate protection, author deletion and moderation',async()=>{
  const post=await action(visitor,'post','/plans/'+planId+'/comments',userCsrf,{body:'测试心得：该循环条件需要补充。',versionId});assert.equal(post.status,200,JSON.stringify(post.body));
  assert.equal((await action(visitor,'post','/plans/'+planId+'/comments',userCsrf,{body:'测试心得：该循环条件需要补充。',versionId})).status,409);
  const comment=(await visitor.get('/api/plans/'+planId+'/comments')).body.items[0];
  assert.equal((await action(publisher,'delete','/comments/'+comment.id,pubCsrf)).status,403);
  assert.equal((await action(publisher,'post','/plans/'+planId+'/comments',pubCsrf,{body:'谢谢，会补充条件。',parentId:comment.id,versionId})).status,200);
  assert.equal((await action(publisher,'post','/comments/'+comment.id+'/report',pubCsrf,{reason:'测试举报流程'})).status,200);
  assert.equal((await action(owner,'patch','/owner/comments/'+comment.id,ownerCsrf,{status:'hidden'})).status,200);
  assert.equal((await anonymous.get('/api/plans/'+planId+'/comments')).body.items[0].body,'该评论已隐藏');
  assert.equal((await action(visitor,'delete','/comments/'+comment.id,userCsrf)).status,200);
  const deleted=(await anonymous.get('/api/plans/'+planId+'/comments')).body.items[0];assert.equal(deleted.body,'该评论已删除');assert.equal(deleted.replies.length,1);
 });
 await t.test('working copies do not change public content; new version resets rating only',async()=>{
  const draft=(await owner.get('/api/admin/plans/'+planId)).body;draft.draft.summary='第二版已更新';await action(owner,'put','/admin/plans/'+planId,ownerCsrf,{data:draft.draft,revision:draft.revision});
  assert.notEqual((await anonymous.get('/api/plans/'+planId)).body.data.summary,'第二版已更新');
  assert.equal((await action(owner,'post','/admin/plans/'+planId+'/publish',ownerCsrf,{confirmed:true,revision:draft.revision+1})).status,200);
  const current=(await anonymous.get('/api/plans/'+planId)).body;assert.equal(current.number,2);assert.equal(current.data.summary,'第二版已更新');assert.equal((await visitor.get('/api/plans/'+planId+'/feedback')).body.rating.count,0);
  assert.equal((await action(visitor,'put','/plans/'+planId+'/rating',userCsrf,{stars:5,versionId})).status,409);
  assert.equal(Number((await one('SELECT count(*) FROM ratings WHERE version_id=$1',[versionId])).count),1);
 });
 await t.test('disable immediately revokes sessions; unique owner protected',async()=>{
  assert.equal((await action(owner,'patch','/owner/users/'+publisherId,ownerCsrf,{disabled:true,role:'publisher'})).status,200);
  assert.equal((await publisher.get('/api/admin/dashboard')).status,401);
  const me=(await owner.get('/api/me')).body.user;assert.equal((await action(owner,'patch','/owner/users/'+me.id,ownerCsrf,{disabled:true,role:'user'})).status,403);
 });
 await t.test('SSR exposes indexable escaped content; unlisting returns 404 and revokes image',async()=>{
  let seo=await seoCharacter('kazuha',planId,'<div id="root"></div>');assert.equal(seo.status,200);assert.ok(seo.html.includes('第二版已更新'));
  assert.equal((await action(owner,'post','/admin/plans/'+planId+'/unlist',ownerCsrf,{})).status,200);
  assert.equal((await anonymous.get('/api/plans/'+planId)).status,404);assert.equal((await action(visitor,'put','/plans/'+planId+'/like',userCsrf,{liked:true})).status,404);assert.equal((await anonymous.get('/api/assets/'+imageId)).status,401);
  seo=await seoCharacter('kazuha',planId,'<div id="root"></div>');assert.equal(seo.status,404);
 });
 await t.test('database and original-file backup restores into a fresh PostgreSQL engine',async()=>{
  const data=await exportBackup();assert.ok(data.files[sourceId]);assert.equal(data.tables.versions.length,2);
  const {PGlite}=await import('@electric-sql/pglite');const target=new PGlite();await target.exec(await readFile('server/migrations/001_initial.sql','utf8'));await restoreInto(target,data);
  assert.equal(Number((await target.query('SELECT count(*) FROM users')).rows[0].count),4);assert.equal((await target.query('SELECT status FROM plans WHERE id=$1',[planId])).rows[0].status,'unlisted');assert.equal(Number((await target.query('SELECT count(*) FROM sessions')).rows[0].count),0);await target.close();
 });
});
async function zip(parts){const chunks=[];const a=archiver('zip');a.on('data',b=>chunks.push(b));const done=new Promise((resolve,reject)=>{a.on('end',resolve);a.on('error',reject);});for(const [name,text] of Object.entries(parts))a.append(text,{name});await a.finalize();await done;return Buffer.concat(chunks);}
function makePdf(text=''){const content=text?`BT /F1 16 Tf 50 700 Td (${text}) Tj ET`:'0.5 g 50 50 300 500 re f';const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});const start=Buffer.byteLength(pdf);pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(v=>String(v).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(pdf);}
test('representative extraction fixtures and honest fallback',async t=>{
 await t.test('DOCX Chinese paragraphs and table cells',async()=>{const b=await zip({'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>','_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>','word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>枫原万叶：缺失版本样本</w:t></w:r></w:p><w:p><w:r><w:t>武器推荐</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>铁蜂刺</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>条件未注明</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'});const mime=detect(b,'table.docx');const r=await extract(b,mime);assert.ok(r.text.includes('铁蜂刺'));assert.ok(r.text.includes('条件未注明'));assert.ok(r.modules.some(m=>m.type==='weapons'));});
 await t.test('text PDF extracts actual text; no text layer fails clearly',async()=>{const r=await extract(makePdf('Weapon guide: source conditions missing'),'application/pdf');assert.ok(r.text.includes('Weapon guide'));await assert.rejects(extract(makePdf(),'application/pdf'),/扫描 PDF/);});
 await t.test('images remain unchanged and generate a picture-only module',async()=>{const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1kAAAAASUVORK5CYII=','base64');const result=await extract(png,'image/png');assert.equal(result.text,'');assert.equal(result.modules[0].body,'');assert.deepEqual(Buffer.from(result.images[0].data,'base64'),png);assert.match(result.quality,/直接展示/);});
 await t.test('messy text never invents data; file signature mismatch rejected',()=>{const r=structure('任意没有标题的文字\n不知是什么队伍，也没有具体数值');assert.equal(r.modules.length,0);assert.equal(r.unassigned.length,2);assert.equal(r.quality,'无法识别');assert.throws(()=>detect(Buffer.from('not a real pdf'),'fake.pdf'),/实际格式/);});
});
