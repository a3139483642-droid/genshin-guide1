import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {projectFile} from './paths.mjs';
import {env,onNetlify} from './environment.mjs';
export const cloud = onNetlify;
export const dataDir = path.resolve(process.env.DATA_DIR || '.data');
let pending;
export async function database(){
  if(!pending) pending=(async()=>{
    let db;
    const connectionString=env('DATABASE_URL');
    const postgres=cloud || Boolean(connectionString);
    try {
    if(postgres){
      if(!connectionString && !env('NETLIFY_DB_URL'))throw Object.assign(new Error('数据库尚未连接，请在 Netlify 的 Data & Storage → Database 中检查数据库并重新部署。'),{status:503,code:'DATABASE_NOT_CONFIGURED'});
      const { getDatabase } = await import('@netlify/database');
      const native=getDatabase(connectionString ? {connectionString} : undefined);
      db={query:(sql,args=[])=>native.pool.query(sql,args),transaction:async(fn)=>{const c=await native.pool.connect();try{await c.query('BEGIN');const out=await fn(c);await c.query('COMMIT');return out;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},close:()=>native.pool.end()};
    } else {
      await mkdir(dataDir,{recursive:true});
      const {PGlite}=await import('@electric-sql/pglite');
      db=new PGlite(path.join(dataDir,'postgres'));
      await db.waitReady;
    }
    const schema=await readFile(projectFile('server/migrations/001_initial.sql'),'utf8');
    if(postgres){await db.transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(714602)');for(const statement of schema.split(';').filter(s=>s.trim()))await c.query(statement);});}
    else for(const statement of schema.split(';').filter(s=>s.trim())) await db.query(statement);
    return db;
    } catch(error){await db?.close().catch(()=>{});throw error;}
  })().catch(error=>{pending=undefined;throw error;});
  return pending;
}
export async function rows(sql,args=[]){return (await (await database()).query(sql,args)).rows;}
export async function one(sql,args=[]){return (await rows(sql,args))[0];}
export async function tx(fn){return (await database()).transaction(fn);}
