import {moduleNames} from './schema.mjs';
const headingTypes=[[/武器|配装武器/,'weapons'],[/圣遗物|套装/,'artifacts'],[/词条|属性|充能/,'stats'],[/天赋|命座/,'talents'],[/配队|队伍|阵容/,'teams'],[/循环|操作|流程/,'rotation'],[/培养|材料/,'materials'],[/机制|细节/,'mechanics']];
export function structure(text){const modules=[],unassigned=[];let current;
  text.split(/\r?\n/).forEach((raw,i)=>{const line=raw.trim();if(!line)return;const trimmed=line.replace(/^#{1,6}\s*|^[一二三四五六七八九十\d]+[、.．]\s*/g,'');const candidate=trimmed.split(/[：:|｜]/)[0];const found=candidate.length<18?headingTypes.find(([re])=>re.test(candidate)):null;
    if(found){current={id:'module-'+modules.length,type:found[1],title:candidate,body:'',source:`原文第 ${i+1} 行`,hidden:false,assetIds:[]};modules.push(current);const rest=trimmed.slice(candidate.length).replace(/^[：:|｜]\s*/,'');if(rest)current.body=rest;}
    else if(current){current.body+=(current.body?'\n':'')+line;}else unassigned.push({text:line,line:i+1});
  });
  const meaningful=modules.filter(m=>m.body.trim());const issues=[];
  for(const m of modules.filter(m=>!m.body.trim())){unassigned.push({text:m.title,line:m.source});issues.push(`${m.title} 只有标题，缺少内容`);}
  if(unassigned.length)issues.push(`${unassigned.length} 段内容待手动归类，已完整保留`);
  if(!meaningful.length)issues.push('未识别到完整攻略模块，请手动整理');
  issues.push('适用版本、推荐条件与角色归属需要人工核对；不会自动补全数值');
  return {modules:meaningful,unassigned,issues,quality:!meaningful.length?'无法识别':unassigned.length?'部分待整理':'完整结构化'};
}
export function detect(buffer,name){const ext=name.split('.').pop().toLowerCase();if(['txt','md'].includes(ext)&&!buffer.includes(0))return 'text/plain';if(ext==='pdf'&&buffer.subarray(0,5).toString()==='%PDF-')return 'application/pdf';if(ext==='docx'&&buffer.readUInt32LE(0)===0x04034b50)return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';if(ext==='png'&&buffer.subarray(0,8).toString('hex')==='89504e470d0a1a0a')return 'image/png';if(['jpg','jpeg'].includes(ext)&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return 'image/jpeg';if(ext==='webp'&&buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP')return 'image/webp';throw new Error('文件扩展名与实际格式不匹配，支持 TXT、Markdown、DOCX、PDF、PNG、JPEG、WebP');}
async function inspectZip(buffer){const {default:yauzl}=await import('yauzl');await new Promise((resolve,reject)=>{yauzl.fromBuffer(buffer,{lazyEntries:true},(err,zip)=>{if(err)return reject(err);let total=0,count=0,hasDocument=false;zip.on('entry',e=>{total+=e.uncompressedSize;count++;if(e.fileName==='word/document.xml')hasDocument=true;if(total>25*1024*1024||count>1500||/vbaProject|\.exe$|\.js$/i.test(e.fileName)){zip.close();return reject(new Error('文档解压体积超限或包含不允许的可执行内容'));}zip.readEntry();});zip.on('end',()=>hasDocument?resolve():reject(new Error('不是有效的 DOCX 文档')));zip.on('error',reject);zip.readEntry();});});}
export async function extract(buffer,mime){let text='',images=[],warnings=[];
  if(mime==='text/plain'){text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}
  else if(mime.includes('wordprocessingml')){await inspectZip(buffer);const {default:mammoth}=await import('mammoth');const out=await mammoth.extractRawText({buffer});text=out.value;warnings=out.messages.map(m=>m.message);await mammoth.convertToHtml({buffer},{convertImage:mammoth.images.imgElement(async image=>{if(images.length<12&&['image/png','image/jpeg','image/webp'].includes(image.contentType)){const b=await image.read();if(b.length<2*1024*1024)images.push({mime:image.contentType,data:Buffer.from(b).toString('base64')});}return {src:''};})});}
  else if(mime==='application/pdf'){const {default:parse}=await import('pdf-parse/lib/pdf-parse.js');const result=await parse({data:Uint8Array.from(buffer),isEvalSupported:false},{max:51});if(result.numpages>50)throw new Error('PDF 超过 50 页，请拆分后重试');text=result.text;warnings.push('PDF 来源按提取文本行号标记；复杂表格需人工核对。内嵌图片请另行上传。');if(!text.trim())throw new Error('扫描 PDF 没有可读取的文本层；OCR 未配置。原文件已保留，请粘贴识别文字或手动整理。');}
  else if(mime.startsWith('image/'))return {text:'',images:[{mime,data:buffer.toString('base64')}],modules:[{id:'module-image',type:'notes',title:'攻略图片',body:'',source:'上传原图',hidden:false,assetIds:[]}],unassigned:[],issues:['请确认所属角色、适用版本与图片来源'],warnings:[],quality:'原图已准备好，可直接展示'};
  if(text.length>150000)throw new Error('提取文本超过 15 万字符，请拆分后重试');
  if(!text.trim())throw new Error('文件没有可识别的文字，请手动整理');
  return {text,images,...structure(text),warnings};
}

