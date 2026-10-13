import archiver from 'archiver';
import {createWriteStream} from 'node:fs';
import {mkdir} from 'node:fs/promises';

const files=[
  'netlify/functions/api.mjs',
  'server/schema.mjs','server/parser.mjs','server/imports.mjs',
  'src/main.jsx','src/admin.jsx','src/style.css',
  'tests/netlify-images.test.mjs','tests/system.test.mjs',
  'README.md','docs/ACCEPTANCE.md','docs/图片直接展示更新.md',
  'scripts/package-image-fix.mjs',
];
await mkdir('deliverables',{recursive:true});
const target='deliverables/teyvat-image-display-fix.zip';
const output=createWriteStream(target),archive=archiver('zip',{zlib:{level:9}});
const done=new Promise((resolve,reject)=>{output.on('close',resolve);output.on('error',reject);archive.on('error',reject);});
archive.pipe(output);
for(const file of files)archive.file(file,{name:file});
await archive.finalize();await done;
console.log('图片展示更新包已生成：'+target+'（'+files.length+' 个文件，无数据库、原件或密钥）');
