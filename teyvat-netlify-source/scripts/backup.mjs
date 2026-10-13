import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {exportBackup} from '../server/backup.mjs';
import {database} from '../server/db.mjs';
const output=path.resolve(process.argv[2]||'deliverables/backup-'+new Date().toISOString().slice(0,10)+'.json');
await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(await exportBackup()));await (await database()).close();console.log('备份已写入：'+output+'（包含私有原件与账号哈希，请安全保存）');
