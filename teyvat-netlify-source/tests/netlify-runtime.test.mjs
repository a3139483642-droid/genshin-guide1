import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';

test('modern Netlify runtime: platform database environment, recovery and authentication',async()=>{
  // Exercise the real SDK and pg driver over TCP. No production credentials/data.
  const values=new Map([['SETUP_KEY','runtime-test-only']]);
  globalThis.Netlify={env:{get:name=>values.get(name)}};
  delete process.env.DATABASE_URL;
  delete process.env.NETLIFY_DB_URL;
  const {default:api}=await import('../netlify/functions/api.mjs');
  const {database}=await import('../server/db.mjs');
  const context={requestId:'runtime-test',ip:'127.0.0.1'};
  const invoke=(pathname,options={})=>api(new Request('https://site.test'+pathname,{...options,headers:{host:'site.test','x-forwarded-proto':'https',...options.headers}}),context);
  let pg,server,connection;
  try {
    let result=await invoke('/api/status');
    assert.equal(result.status,503);
    assert.match((await result.json()).error,/数据库尚未连接/);
    values.set('NETLIFY_DB_URL','postgresql://postgres@127.0.0.1:1/postgres?connect_timeout=1');
    await assert.rejects(database(),{code:'ECONNREFUSED'});
    pg=await PGlite.create();
    server=new PGLiteSocketServer({db:pg,port:0,host:'127.0.0.1'});
    await server.start();
    values.set('NETLIFY_DB_URL','postgresql://postgres@'+server.getServerConn()+'/postgres');
    result=await invoke('/api/status');
    assert.equal(result.status,200,await result.clone().text());
    assert.deepEqual(await result.json(),{needsSetup:true,local:false,ocr:false});
    connection=await database();
    result=await invoke('/.netlify/functions/api/characters?q='+encodeURIComponent('万叶'));
    assert.equal(result.status,200);
    const characters=await result.json();
    assert.equal(characters.total,1);assert.equal(characters.items[0].id,'kazuha');
    const credentials={username:'cloud_test',password:'runtime-test-passphrase',includeSample:false};
    result=await invoke('/api/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...credentials,setupKey:'wrong'})});
    assert.equal(result.status,403);
    result=await invoke('/api/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...credentials,setupKey:values.get('SETUP_KEY')})});
    assert.equal(result.status,200,await result.clone().text());
    const cookie=result.headers.get('set-cookie');assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);
    result=await invoke('/api/me',{headers:{cookie:cookie.split(';')[0]}});
    assert.equal((await result.json()).user.role,'owner');
    const {default:page}=await import('../netlify/functions/page.mjs');
    result=await page(new Request('https://site.test/characters/missing'),context);
    assert.equal(result.status,404);assert.match(await result.text(),/<!doctype html>/i);
  } finally {
    if(connection)await connection.close();
    if(server)await server.stop();
    if(pg)await pg.close();
    delete globalThis.Netlify;
  }
});
