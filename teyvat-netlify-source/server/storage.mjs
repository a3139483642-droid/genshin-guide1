import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {cloud,dataDir} from './db.mjs';
function safe(key){if(!/^[a-zA-Z0-9._-]+$/.test(key)) throw new Error('Invalid storage key');return key;}
async function store(){const {getStore}=await import('@netlify/blobs');return getStore({name:'teyvat-private',consistency:'strong'});}
export async function putFile(key,buffer){safe(key);if(cloud)return (await store()).set(key,buffer);await mkdir(path.join(dataDir,'files'),{recursive:true});await writeFile(path.join(dataDir,'files',key),buffer);}
export async function getFile(key){safe(key);if(cloud){const b=await (await store()).get(key,{type:'arrayBuffer'});if(!b)throw new Error('文件不存在');return Buffer.from(b);}return readFile(path.join(dataDir,'files',key));}
export async function removeFile(key){safe(key);if(cloud)return (await store()).delete(key);await unlink(path.join(dataDir,'files',key)).catch(()=>{});}
