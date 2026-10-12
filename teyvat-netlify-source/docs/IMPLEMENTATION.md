# 技术实现说明

## 结构

```text
src/                  React 前台、后台、原文对照整理器
server/app.mjs        Express API 与服务端授权
server/auth.mjs       scrypt 密码、数据库会话、CSRF、共享限频
server/db.mjs         PostgreSQL / 本地 PGlite 适配
server/migrations/    数据表与约束
server/parser.mjs     格式校验、DOCX/PDF 提取、规则结构化
server/parser-worker.mjs  限制内存的独立解析线程
server/imports.mjs    导入状态机、超时、重试与任务认领
server/storage.mjs    Netlify Blobs / 本地私有文件适配
server/backup.mjs     数据与文件完整备份、恢复
server/seo.mjs        公开角色/方案首屏 HTML
netlify/functions/    API、SSR、异步队列、定时备份
scripts/              打包、备份与恢复脚本
tests/                真数据库与真实解析器的集成测试
```

生产：React + Vite 静态资源，Netlify Functions 执行 API/SEO，Netlify Database 关系数据库，Netlify Blobs 私有原文件/图片。原始文件不放在 dist。开发使用同一套 SQL 和 API，PGlite 提供持久化 PostgreSQL 引擎，本地 Express 仅用于开发及验收。

全部函数使用现代 Netlify Functions 运行时。API、SSR 和后台任务通过官方 withLambda 默认导出；不再使用旧 handler 导出或 connectLambda。环境配置优先读取 Netlify.env，SQL/模板/解析线程以 ESM 模块路径定位。初始化失败会释放连接池并允许下次请求重试，缺少数据库连接返回明确的 503。

## 数据与一致性

用户、会话、角色、方案、版本、素材、导入、评论、评分、点赞、举报、日志、站点配置均为独立关系表。攻略模块作为经过 Zod 校验的 JSONB 数据，不存任意可执行组件。

发布使用数据库事务和方案行锁，将版本、公开指针与修订号一起提交；素材权限由当前公开版本的可见模块引用实时推导，无独立容易失配的公开标记。编辑用修订号实现 compare-and-set。公开 API 不缓存，后续请求可直接读取最新状态。

评分主键是 user_id + version_id；点赞主键是 user_id + plan_id。点赞接口接收 desired state 并使用 ON CONFLICT，而非无幂等保护的“切换计数”操作。互动操作与更新/下架竞争时通过方案锁及事务隔离保持顺序。

## 账号与权限

用户名 + 密码登录；此版本未集成邮箱验证或第三方登录。普通注册拒绝客户端控制角色。密码使用 scrypt 和独立随机盐。会话 token 仅以哈希写入数据库，Cookie 为 HttpOnly/SameSite=Strict，HTTPS 下启用 Secure。写请求校验 CSRF token 与 Origin。登录、注册、互动、导入等限频保存在数据库，不依赖单个函数进程内存。

所有管理接口再次校验服务端身份与内容归属。禁用账号和角色变更同时撤销会话。唯一 owner 有数据库部分唯一索引和应用层保护。私有图片/源文件读取也必须鉴权。

## 导入

文本采用确定性规则，未配置任何模型接口。原文保留，识别模块包含来源行号；剩余文本保存在未归类区域。允许手动补充、拆分、合并和排序。

文件头与扩展名校验、3 MB 请求限制、DOCX 25 MB 解压总量/1500 条目限制、禁止宏/可执行条目、50 页 PDF 限制、15 万字符限制。解析在 Worker 线程中完成，192 MB JS 堆上限、45 秒墙钟超时；进程级系统总内存仍由 Netlify 控制。PDF 引擎关闭 eval，复制到独立 Uint8Array 防止 Buffer 偏移读取错误；不运行来源脚本或外部引用。

云端由每分钟定时函数触发经过 SETUP_KEY 鉴权的后台函数；后台认领 queued 任务后解析。中断任务超过两分钟标为失败，可重试。本地使用后台队列和相同 Worker。

## 展示与可索引性

首页保留米白/深青/古金与元素字形卡片。桌面四列，平板三列，手机两列。前台 React 默认文本转义，不使用 dangerouslySetInnerHTML 展示用户内容；SSR 单独转义。

`/characters/:id?plan=:planId#moduleId` 为稳定入口。Netlify 动态页面提供角色、方案与模块的可索引 HTML；React 加载后提供交互。下架指定方案返回 HTTP 404。后台和源文件不通过公开页面输出。

## 运行边界

小站完整 JSON 备份适用于有限素材量，大规模站点需要流式/增量导出。管理员工作台显示最近 100 条方案和 50 个导入任务，用户管理最近 200 个账号；前台角色与评论有分页。尚未进行大规模云端负载测试。

原始 PRD 中“真实样本识别质量”“独立外部备份”“云端持久性”需要实际资料、用户部署环境与独立存储验证；本地通过不代表这些云端项目已经验收。
