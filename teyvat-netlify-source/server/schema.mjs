import {z} from 'zod';
const text=z.string().trim().max(6000);
export const moduleTypes=['weapons','artifacts','stats','talents','teams','rotation','materials','mechanics','notes'];
export const moduleNames={weapons:'武器推荐',artifacts:'圣遗物搭配',stats:'词条选择',talents:'天赋与命座',teams:'配队方案',rotation:'操作循环',materials:'培养路线',mechanics:'机制细节',notes:'补充说明'};
export const moduleSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),type:z.enum(moduleTypes),title:z.string().trim().min(1).max(80),body:text,source:text.default('手动整理'),hidden:z.boolean().default(false),assetIds:z.array(z.string().uuid()).max(20).default([])}).refine(m=>m.body.length>0||m.assetIds.length>0,{message:'请填写文字内容或添加展示图片',path:['body']});
export const guideSchema=z.object({title:z.string().trim().min(1).max(100),gameVersion:z.string().trim().min(1).max(100),summary:text,source:text,importId:z.string().uuid().optional(),modules:z.array(moduleSchema).min(1).max(40)}).refine(v=>new Set(v.modules.map(m=>m.id)).size===v.modules.length,{message:'模块标识不能重复'});
export function problem(status,message){const e=new Error(message);e.status=status;throw e;}
export function clean(value,max=6000){return String(value??'').replace(/\u0000/g,'').trim().slice(0,max);}
