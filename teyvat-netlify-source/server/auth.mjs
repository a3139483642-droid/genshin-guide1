import {randomBytes,randomUUID,scrypt as scryptCb,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {one,rows} from './db.mjs';
import {problem} from './schema.mjs';
const scrypt=promisify(scryptCb);
export const id=()=>randomUUID();
export const digest=s=>createHash('sha256').update(s).digest('hex');
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');return salt+':'+Buffer.from(await scrypt(password,salt,64)).toString('hex');}
export async function verifyPassword(password,hash){const [salt,key]=hash.split(':');const actual=Buffer.from(await scrypt(password,salt,64));return timingSafeEqual(actual,Buffer.from(key,'hex'));}
export async function rate(key,limit=20,seconds=60){const r=await one(`INSERT INTO rate_limits(key,count,reset_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.reset_at<now() THEN 1 ELSE rate_limits.count+1 END,reset_at=CASE WHEN rate_limits.reset_at<now() THEN now()+$2*interval '1 second' ELSE rate_limits.reset_at END RETURNING count`,[key,seconds]);if(r.count>limit)problem(429,'操作太频繁，请稍后再试');}
export async function identify(req,res,next){try{const token=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('teyvat_session='))?.slice(15);if(token){const s=await one('SELECT s.*,u.username,u.display_name,u.role,u.disabled FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>now()',[digest(token)]);if(s&&!s.disabled){req.user={id:s.user_id,username:s.username,displayName:s.display_name,role:s.role};req.session=s;}}next();}catch(e){next(e);}}
export function requireUser(req){if(!req.user)problem(401,'请先登录');return req.user;}
export function requireAdmin(req){const u=requireUser(req);if(!['owner','publisher'].includes(u.role))problem(403,'仅发布管理员可执行此操作');return u;}
export function requireOwner(req){const u=requireUser(req);if(u.role!=='owner')problem(403,'仅站长可执行此操作');return u;}
export function owns(req,obj){requireAdmin(req);if(req.user.role!=='owner'&&obj.owner_id!==req.user.id)problem(404,'内容不存在');}
export async function session(req,res,user){const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');await rows('INSERT INTO sessions(id,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval \'7 days\')',[digest(token),user.id,csrf]);res.cookie('teyvat_session',token,{httpOnly:true,sameSite:'strict',secure:req.secure||req.headers['x-forwarded-proto']==='https',maxAge:7*864e5,path:'/'});return {user:{id:user.id,username:user.username,displayName:user.display_name,role:user.role},csrf};}
export function csrf(req,res,next){if(['GET','HEAD','OPTIONS'].includes(req.method))return next();const origin=req.headers.origin;const expected=(req.headers['x-forwarded-proto']||req.protocol)+'://'+req.get('host');if(origin&&origin!==expected)return next(Object.assign(new Error('请求来源不匹配'),{status:403}));if(req.session&&req.headers['x-csrf-token']!==req.session.csrf)return next(Object.assign(new Error('安全令牌失效，请刷新页面'),{status:403}));next();}
export async function audit(user,action,target,connection){const q=connection?connection.query.bind(connection):rows;await q('INSERT INTO audit(id,user_id,action,target) VALUES($1,$2,$3,$4)',[id(),user,action,target]);}
