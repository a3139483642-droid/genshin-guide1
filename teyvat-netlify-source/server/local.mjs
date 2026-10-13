import express from 'express';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {app} from './app.mjs';
import {database,dataDir} from './db.mjs';
import {seed} from './seed.mjs';
import {processQueue} from './imports.mjs';
import {backup} from './backup.mjs';
import {seoCharacter} from './seo.mjs';
const production=process.argv.includes('--production');
await database();await seed();
let vite;
if(!production){const {createServer}=await import('vite');vite=await createServer({server:{middlewareMode:true},appType:'custom'});}
app.get('/characters/:id',async(req,res,next)=>{try{let html=await readFile(production?'dist/index.html':'index.html','utf8');if(vite)html=await vite.transformIndexHtml(req.originalUrl,html);const result=await seoCharacter(req.params.id,req.query.plan,html);res.status(result.status).type('html').send(result.html);}catch(e){next(e);}});
if(production)app.use(express.static('dist',{index:false}));else app.use(vite.middlewares);
app.use(async(req,res,next)=>{if(req.method!=='GET')return next();try{let html=await readFile(production?'dist/index.html':'index.html','utf8');if(vite)html=await vite.transformIndexHtml(req.originalUrl,html);res.type('html').send(html);}catch(e){next(e);}});
const port=Number(process.env.PORT||4173);const server=app.listen(port,'127.0.0.1',()=>console.log(`提瓦特行旅手册已启动：http://127.0.0.1:${port}\n首次使用请访问 /setup 创建站长。数据目录：${dataDir}`));
let active=false;async function queue(){if(active)return;active=true;try{await processQueue();}catch(e){console.error('Queue failed:',e.message);}finally{active=false;}}
const interval=setInterval(queue,15000);queue();
let backupDay='';const backupInterval=setInterval(async()=>{const today=new Date().toISOString().slice(0,10);if(today!==backupDay){try{await backup();backupDay=today;}catch(e){console.error('Backup failed:',e.message);}}},3600000);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{clearInterval(interval);clearInterval(backupInterval);server.close();await vite?.close();await (await database()).close();process.exit(0);});
