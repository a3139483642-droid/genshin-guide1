import {readFile} from 'node:fs/promises';
import {getStore} from '@netlify/blobs';
if(!process.argv[2]||!process.env.DATABASE_URL||!process.env.NETLIFY_SITE_ID||!process.env.NETLIFY_AUTH_TOKEN)throw new Error('用法：node scripts/restore-cloud.mjs 备份.json；环境需 DATABASE_URL、NETLIFY_SITE_ID、NETLIFY_AUTH_TOKEN，目标必须为空。');
const store=getStore({name:'teyvat-private',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_AUTH_TOKEN,consistency:'strong'});
if((await store.list()).blobs.length)throw new Error('目标 Blobs store 非空，拒绝覆盖。请使用新站点验证恢复。');
const data=JSON.parse(await readFile(process.argv[2],'utf8'));
if(data.format!=='teyvat-backup-v1')throw new Error('备份格式无效');
const {database}=await import('../server/db.mjs');const {restoreInto}=await import('../server/backup.mjs');
const db=await database();
try{await restoreInto(db,data);for(const a of data.tables.assets){if(!data.files[a.id])throw new Error('备份缺少文件：'+a.id);await store.set(a.id,Buffer.from(data.files[a.id],'base64'));}console.log('已恢复到空的云端目标。请检查数据与文件后再开放网站。');}finally{await db.close();}
