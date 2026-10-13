import {env} from '../../server/environment.mjs';
export default async()=>{if(!env('URL')||!env('SETUP_KEY'))throw new Error('URL or SETUP_KEY missing');const result=await fetch(env('URL')+'/.netlify/functions/import-background',{method:'POST',headers:{'Content-Type':'application/json','X-Task-Key':env('SETUP_KEY')},body:'{}'});if(!result.ok)throw new Error('Failed to trigger import queue');};
export const config={schedule:'* * * * *'};
