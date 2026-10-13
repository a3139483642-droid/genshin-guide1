import archiver from 'archiver';
import {createWriteStream} from 'node:fs';
import {mkdir} from 'node:fs/promises';
await mkdir('deliverables',{recursive:true});const target='deliverables/teyvat-netlify-source.zip';const output=createWriteStream(target);const archive=archiver('zip',{zlib:{level:9}});const done=new Promise((resolve,reject)=>{output.on('close',resolve);archive.on('error',reject);});archive.pipe(output);archive.glob('**/*',{dot:true,ignore:['node_modules/**','.data/**','.env','.env.*','deliverables/**','.git/**','.netlify/**','tests/tmp/**']});archive.file('.env.example',{name:'.env.example'});await archive.finalize();await done;console.log('部署源码包已生成：'+target+'；不含账号、私有资料、运行数据库或密钥。');
