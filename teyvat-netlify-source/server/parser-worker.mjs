import {parentPort,workerData} from 'node:worker_threads';
import {extract} from './parser.mjs';
try {parentPort.postMessage({ok:true,result:await extract(Buffer.from(workerData.bytes),workerData.mime)});}catch(e){parentPort.postMessage({ok:false,error:e.message});}
