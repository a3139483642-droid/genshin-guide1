import {one,tx} from './db.mjs';
export const characters=[
['kazuha','枫原万叶','万叶 枫原','风','单手剑','红叶逐荒波','枫',['辅助','聚怪']],
['raiden','雷电将军','雷神 影','雷','长柄武器','一心净土','雷',['输出','充能']],
['nahida','纳西妲','草神 小吉祥草王','草','法器','白草净华','草',['辅助','元素反应']],
['neuvillette','那维莱特','水龙 那维','水','法器','谕告的潮音','潮',['输出','重击']],
['hutao','胡桃','堂主','火','长柄武器','雪霁梅香','蝶',['输出']],
['zhongli','钟离','岩神 帝君','岩','长柄武器','尘世闲游','岩',['辅助','护盾']],
['ayaka','神里绫华','绫华 神里','冰','单手剑','白鹭霜华','霜',['输出']],
['furina','芙宁娜','水神 芙芙','水','单手剑','不休独舞','澜',['辅助']]
];
export async function seed(){if(await one('SELECT id FROM characters LIMIT 1'))return;await tx(async c=>{for(let i=0;i<characters.length;i++){const [id,name,aliases,element,weapon,title,glyph,tags]=characters[i];await c.query('INSERT INTO characters(id,name,aliases,element,weapon,title,glyph,tags,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING',[id,name,aliases,element,weapon,title,glyph,JSON.stringify(tags),i]);}});}
export function sampleGuide(){const parts=[['weapons','武器推荐','铁蜂刺｜锻造获取；精通方向的配装示例。\n西风剑｜充能方向的替代示例；需结合暴击与队伍循环校对。\n苍古自由之誓｜五星武器示例；推荐条件需依据实际资料补充。'],['artifacts','圣遗物搭配','翠绿之影 · 4 件套｜风元素辅助方向的展示示例。\n替代搭配｜来源未提供，不自动补全。'],['stats','主词条与副词条','时之沙：元素精通\n空之杯：元素精通\n理之冠：元素精通\n副词条：元素充能效率 / 元素精通\n充能目标：条件未注明，需按队伍与循环实测。'],['talents','天赋培养','按实际玩法确定培养优先级。示例不提供未经核对的天赋等级或关键命座结论。'],['teams','四人队伍示例','雷电将军｜输出\n枫原万叶｜辅助\n九条裟罗｜辅助\n班尼特｜治疗与辅助\n队伍说明：用于演示四人阵容展示；替代角色与适用条件请在导入实际资料后补充。'],['rotation','操作顺序示例','雷电将军：施放元素战技。\n辅助角色：依资料依次施放技能，确认增益与元素附着。\n枫原万叶：按实际环境完成扩散与聚怪。\n雷电将军：进入输出阶段。\n说明：来源未提供精确时长，不显示时间刻度。'],['materials','培养清单','确认武器与圣遗物方案\n准备突破材料\n检查元素充能效率\n在实际队伍中验证循环'],['mechanics','阅读这份示例','这是一份用于验证页面与后台流程的功能示例，不是当前版本权威攻略。可由站长下架，或导入自己的资料替换。']];return {title:'功能示例 · 辅助培养',gameVersion:'来源未注明 · 请以实际游戏为准',summary:'把配装、词条和操作整理在同一页。此方案用于功能演示，正式攻略等待管理员导入。',source:'项目内置功能示例；未经当前版本实战核验。',modules:parts.map(([type,title,body],i)=>({id:'sample-'+i,type,title,body,source:'项目功能示例',hidden:false,assetIds:[]}))};}
