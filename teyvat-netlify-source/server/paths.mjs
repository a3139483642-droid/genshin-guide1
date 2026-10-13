import path from 'node:path';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// Netlify can preserve the repository's subdirectory inside the function ZIP.
// Resolve from the actual project, rather than assuming the Lambda working directory.
export function projectRoot(){
  const candidates=[process.env.TEYVAT_PROJECT_ROOT,fileURLToPath(new URL('../',import.meta.url)),process.cwd()].filter(Boolean);
  for(const root of candidates)if(existsSync(path.join(root,'server/migrations/001_initial.sql')))return root;
  throw new Error('项目运行文件缺失，请部署完整源码与 netlify.toml');
}
export const projectFile=relative=>path.join(projectRoot(),relative);
