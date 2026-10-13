import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

for(const key of ['NETLIFY','AWS_LAMBDA_FUNCTION_NAME','DATABASE_URL','NETLIFY_DB_URL','NETLIFY_DB_DRIVER','TEYVAT_PROJECT_ROOT'])delete process.env[key];
delete globalThis.Netlify;
process.env.DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'teyvat-images-'));
const {default:api}=await import('../netlify/functions/api.mjs');
const {database}=await import('../server/db.mjs');
after(async()=>{await (await database()).close();});

test('native Netlify image import, picture-only publishing and original binary downloads',async()=>{
  const context={requestId:'image-runtime-test',ip:'127.0.0.1'};
  let cookie,csrf;
  const invoke=(url,options={})=>api(new Request('https://site.test'+url,{...options,headers:{host:'site.test','x-forwarded-proto':'https',...options.headers}}),context);
  const json=(url,body)=>invoke(url,{method:'POST',headers:{cookie,'x-csrf-token':csrf,'content-type':'application/json'},body:JSON.stringify(body)});
  let response=await invoke('/api/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'picture_owner',password:'image-test-passphrase',includeSample:false})});
  assert.equal(response.status,200,await response.clone().text());
  cookie=response.headers.get('set-cookie').split(';')[0];
  csrf=(await response.json()).csrf;

  const fixtures=[
    {name:'guide.png',mime:'image/png',bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1kAAAAASUVORK5CYII=','base64')},
    {name:'guide.jpg',mime:'image/jpeg',bytes:Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=','base64')},
    {name:'guide.webp',mime:'image/webp',bytes:Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64')},
  ];
  for(const fixture of fixtures){
    const form=new FormData();form.append('file',new Blob([fixture.bytes],{type:fixture.mime}),fixture.name);
    response=await invoke('/api/admin/imports',{method:'POST',headers:{cookie,'x-csrf-token':csrf},body:form});
    assert.equal(response.status,200,await response.clone().text());
    const importId=(await response.json()).id;
    let job;
    for(let attempt=0;attempt<100;attempt++){
      response=await invoke('/api/admin/imports/'+importId,{headers:{cookie}});job=await response.json();
      if(['review','failed'].includes(job.status))break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.equal(job.status,'review',JSON.stringify(job));
    assert.equal(job.error,null);assert.equal(job.text,'');
    const imageId=job.result.imageIds[0];
    assert.deepEqual(job.result.modules[0].assetIds,[imageId]);
    assert.equal(job.result.modules[0].body,'');
    for(const assetId of [job.asset_id,imageId]){
      response=await invoke('/api/assets/'+assetId,{headers:{cookie}});
      assert.equal(response.status,200,await response.clone().text());
      assert.equal(response.headers.get('content-type'),fixture.mime);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),fixture.bytes,fixture.name+' must remain byte-for-byte intact');
      assert.equal((await invoke('/api/assets/'+assetId)).status,401);
    }
    const data={title:fixture.name,gameVersion:'来源未注明',summary:'',source:'图片资料',importId,modules:job.result.modules};
    response=await json('/api/admin/plans',{characterId:'zhongli',data:{...data,modules:data.modules.map(module=>({...module,assetIds:[]}))}});
    assert.equal(response.status,400,'a module with neither text nor image must still be rejected');
    response=await json('/api/admin/plans',{characterId:'zhongli',data});
    assert.equal(response.status,200,await response.clone().text());
    const planId=(await response.json()).id;
    response=await json('/api/admin/plans/'+planId+'/publish',{confirmed:true,revision:1});
    assert.equal(response.status,200,await response.clone().text());
    response=await invoke('/api/plans/'+planId);
    assert.equal(response.status,200);
    const published=await response.json();
    assert.equal(published.data.modules[0].body,'');
    assert.deepEqual(published.data.modules[0].assetIds,[imageId]);
    response=await invoke('/.netlify/functions/api/assets/'+imageId);
    assert.equal(response.status,200,await response.clone().text());
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),fixture.bytes);
    assert.equal((await invoke('/api/assets/'+job.asset_id)).status,401,'private source remains separate from the published image');
  }
});
