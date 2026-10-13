import {backup} from '../../server/backup.mjs';
export default async()=>{await backup();};
export const config={schedule:'0 19 * * *'};
