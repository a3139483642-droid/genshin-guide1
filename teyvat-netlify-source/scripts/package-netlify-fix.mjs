import archiver from 'archiver';
import {createWriteStream} from 'node:fs';
import {mkdir} from 'node:fs/promises';
const files=[
  'package.json','package-lock.json','netlify.toml','README.md',
  'server/environment.mjs','server/db.mjs','server/paths.mjs','server/app.mjs','server/backup.mjs','server/parser.mjs','server/schema.mjs','server/imports.mjs',
  'src/main.jsx','src/admin.jsx','src/style.css',
  'netlify/functions/api.mjs','netlify/functions/page.mjs','netlify/functions/import-background.mjs','netlify/functions/daily-backup.mjs','netlify/functions/queue-tick.mjs',
  'scripts/verify-netlify.mjs','scripts/package-netlify-fix.mjs','scripts/package-image-fix.mjs','tests/netlify-runtime.test.mjs','tests/netlify-images.test.mjs','tests/system.test.mjs',
  'docs/DEPLOYMENT.md','docs/ACCEPTANCE.md','docs/IMPLEMENTATION.md','docs/NETLIFY-修复步骤.md','docs/图片直接展示更新.md',
];
await mkdir('deliverables',{recursive:true});
const target='deliverables/teyvat-netlify-fix.zip',output=createWriteStream(target),archive=archiver('zip',{zlib:{level:9}});
const done=new Promise((resolve,reject)=>{output.on('close',resolve);output.on('error',reject);archive.on('error',reject);});
archive.pipe(output);for(const file of files)archive.file(file,{name:file});
await archive.finalize();await done;
console.log('Netlify 修复包已生成：'+target+'（'+files.length+' 个文件，不含数据库、原件或密钥）');
