import {Worker} from 'node:worker_threads';
import path from 'node:path';
import {projectFile,projectRoot} from './paths.mjs';
import {one,rows,tx} from './db.mjs';
import {getFile,putFile} from './storage.mjs';
import {id} from './auth.mjs';
export async function processImport(importId){const job=await one("UPDATE imports SET status='processing',started_at=now(),attempts=attempts+1 WHERE id=$1 AND status='queued' RETURNING *",[importId]);if(!job)return;
  try{let bytes,mime='text/plain';if(job.asset_id){const a=await one('SELECT * FROM assets WHERE id=$1',[job.asset_id]);bytes=await getFile(a.id);mime=a.mime;}else bytes=Buffer.from(job.text);
    const result=await new Promise((resolve,reject)=>{const worker=new Worker(projectFile('server/parser-worker.mjs'),{workerData:{bytes,mime},env:{...process.env,TEYVAT_PROJECT_ROOT:projectRoot()},resourceLimits:{maxOldGenerationSizeMb:192}});const timer=setTimeout(()=>{worker.terminate();reject(new Error('解析超过 45 秒，任务已停止；请拆分文件或手动整理'));},45000);worker.once('message',r=>{clearTimeout(timer);worker.terminate();r.ok?resolve(r.result):reject(new Error(r.error));});worker.once('error',e=>{clearTimeout(timer);reject(e);});worker.once('exit',code=>{if(code!==0){clearTimeout(timer);reject(new Error('解析进程异常退出'));}});});
    const imageIds=[];for(const image of result.images){const imageId=id(),b=Buffer.from(image.data,'base64');await putFile(imageId,b);await rows("INSERT INTO assets(id,owner_id,filename,mime,kind,size) VALUES($1,$2,$3,$4,'image',$5)",[imageId,job.owner_id,'文档图片',image.mime,b.length]);imageIds.push(imageId);}delete result.images;result.imageIds=imageIds;
    await rows("UPDATE imports SET status='review',text=$2,result=$3,error=NULL WHERE id=$1",[job.id,result.text,JSON.stringify(result)]);
  }catch(e){await rows("UPDATE imports SET status='failed',error=$2 WHERE id=$1",[job.id,String(e.message).slice(0,2000)]);}
}
export async function processQueue(){await rows("UPDATE imports SET status='failed',error='任务超时或执行中断，可重试' WHERE status='processing' AND started_at<now()-interval '2 minutes'");for(const job of await rows("SELECT id FROM imports WHERE status='queued' ORDER BY created_at LIMIT 3"))await processImport(job.id);}


