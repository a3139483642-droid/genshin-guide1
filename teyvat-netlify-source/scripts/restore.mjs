import {readFile} from 'node:fs/promises';
import path from 'node:path';
if(!process.argv[2]||!process.argv[3])throw new Error('用法：npm run restore -- 备份.json 全新的数据目录');
process.env.DATA_DIR=path.resolve(process.argv[3]);
if(process.env.DATABASE_URL||process.env.NETLIFY)throw new Error('此恢复脚本只允许恢复到新的本地目录；云端请使用 Netlify 数据库恢复与文件备份流程。');
const {database}=await import('../server/db.mjs');const {restoreInto}=await import('../server/backup.mjs');const {putFile}=await import('../server/storage.mjs');const data=JSON.parse(await readFile(process.argv[2],'utf8'));const db=await database();await restoreInto(db,data);for(const [id,value] of Object.entries(data.files))await putFile(id,Buffer.from(value,'base64'));await db.close();console.log('已恢复到：'+process.env.DATA_DIR+'；原有站点未修改。');
