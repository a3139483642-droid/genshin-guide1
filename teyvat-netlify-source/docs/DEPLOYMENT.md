# Netlify 部署与备份

交付日期：2026-10-12。用户自行上线。本文件描述可执行配置；不代表云端已经部署或验收。

## 1. 部署完整项目

这不是只有静态页面的网站。**不要只把 dist 拖到 Netlify Drop**，否则 API、后台和持久化存储不会一起部署。推荐将本项目源码放入你的 Git 仓库，在 Netlify 导入该仓库；也可以使用 Netlify CLI。

项目根目录为包含 `package.json` 与 `netlify.toml` 的目录。

| 配置 | 值 |
| --- | --- |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Functions directory | `netlify/functions` |
| Node | 22 或更新支持版本 |
| 数据库 | Netlify Database（PostgreSQL） |
| 文件 | Netlify Blobs，`teyvat-private` store |

项目附带 `netlify.toml`，已配置 API、角色 SEO 页面和单页路由。`deliverables/teyvat-netlify-source.zip` 是源码交付包，解压后用于 Git/CLI 部署，不是静态 Drop 包。

已有站点出现角色接口 500 时，按 [NETLIFY-修复步骤.md](NETLIFY-修复步骤.md) 更新源码和重新部署。

## 2. 关联站点并创建数据库

```powershell
npm ci
npx netlify login
npx netlify init
npx netlify database init
```

也可在现有站点执行 `npx netlify link` 后初始化数据库。数据库由 Netlify 管理，不要求你维护服务器。数据库 SDK 使用平台注入的 `NETLIFY_DB_URL` 与对应分支配置；不要手动把生产连接串写进前端或仓库。

本项目函数已使用现代 Netlify Functions 运行时（默认导出，runtime API 2），通过官方 `@netlify/aws-lambda-compat` 接入 Express，并读取 `Netlify.env`。旧版 `export const handler` 属于 Lambda compatibility mode，无法自动读取托管数据库连接；更新时必须同时上传 `package.json`、`package-lock.json`、`netlify.toml`、`server/` 和 `netlify/functions/` 的修复文件。

在英文控制台展开 **Data & Storage → Database**，确认生产数据库已创建且启用。尚未创建时点击 **Create database**（实际界面可能写 Create a database），等待完成后重新部署。部署成功不等于数据库已接通；检查 `/api/status` 是否返回 JSON 且 HTTP 200。缺少连接时新代码返回明确的 503 提示，不会将用户数据写进函数的临时目录。

如果使用另一个兼容的 PostgreSQL 服务，可在 Functions 环境变量设置服务端 `DATABASE_URL`；数据库需允许 Netlify 连接。文件依旧使用 Netlify Blobs。

首次服务端请求会创建 `server/migrations/001_initial.sql` 中的表，并初始化 8 位角色目录，不会创建默认密码或覆盖数据。生产 schema 初始化使用事务和 PostgreSQL advisory lock，防止多函数冷启动并发建表。

## 3. 配置初始化密钥

在 Netlify 站点设置的环境变量中加入：

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `SETUP_KEY` | 是 | 自行生成的至少 32 字符随机密钥，仅服务端可读；首次创建站长和异步队列内部鉴权使用 |
| `URL` | 平台默认提供 | 站点正式 HTTPS 地址，定时队列用于调用本站后台任务 |
| `DATABASE_URL` | 否 | 仅在不用 Netlify Database 时设置 |
| `BACKUP_WEBHOOK_URL` | 独立副本需要 | 你管理的 HTTPS 备份接收端，接收完整 JSON 文件 |
| `BACKUP_WEBHOOK_TOKEN` | 配合接收端 | 接收端校验的 bearer token |

可以用 Node 的 crypto 生成随机密钥，在本机妥善保存后填入 Netlify 环境变量。不要使用 `VITE_` 前缀，不要将密钥写到公开文档。`SETUP_KEY` 保持配置，后台队列也需要它；轮换时同时保留当前部署能够读取的新值。

设置完成后部署：

```powershell
npm test
npm run build
npx netlify deploy --build --prod
```

这是你主动执行的上线步骤，会向你的 Netlify 账号部署资源。部署资源与费用按你选定的套餐执行。

## 4. 初始化与冒烟检查

1. 打开站点 `/setup`，输入初始化密钥，创建自己的站长账号（密码至少 10 位）。全站只允许一个 owner。
2. 确认 `/api/status` 返回 `needsSetup:false`，后台可以正常登录。
3. 创建一位发布管理员，验证其只能操作自己的草稿与首次发布。
4. 粘贴一段攻略，等待任务从排队变为待校对；任务每分钟由队列调度触发后台函数。首次排队通常等下一次分钟调度。
5. 保存、预览并发布；退出登录，确认公开页面可读，私有源文件不可读。
6. 重新部署一次，确认数据库、图片和互动仍在。
7. 在 Netlify Functions 日志确认 `queue-tick`、`import-background`、`daily-backup` 可正常运行。

站点的访客默认可以阅读公开攻略；匿名访客不能写入。后台的隐藏入口不是权限边界，所有写入由服务端角色和归属校验。

## 5. 备份与恢复

`daily-backup` 每日 19:00 UTC（北京时间次日 03:00）执行。备份含用户哈希、角色、所有草稿和版本、导入记录、互动、设置、日志及全部源文件/展示图片；不含登录会话与限频表。副本保存在私有 Blobs，保留至少 8 天，超过期限才清理。

生产必须配置独立的 `BACKUP_WEBHOOK_URL` 和认证 token，接收端应保留至少 7 天并做好访问控制。未配置时仅生成站点内副本，**不能算完成“独立副本”要求**。接收失败会使定时任务报错，站内副本仍保留。接收端契约：POST JSON，Authorization: Bearer token，成功返回 2xx。

站长可在后台“站点与记录”点击“立即备份”。本地也可停止网站后执行：

```powershell
npm run backup -- D:/备份/teyvat-backup.json
npm run restore -- D:/备份/teyvat-backup.json D:/恢复验证/teyvat-data
```

恢复脚本要求全新的本地目录，拒绝覆盖已有用户数据库。恢复后用对应 `DATA_DIR` 启动检查：

```powershell
$env:DATA_DIR='D:/恢复验证/teyvat-data'
npm start
```

云端恢复：先暂停写入，使用 Netlify Database 的恢复工具恢复数据库快照，再将相应 JSON 备份的文件部分恢复到 Blobs 的同名 key。项目提供的 `scripts/restore-cloud.mjs` 可将本项目 JSON 备份恢复到**空的** PostgreSQL 目标和指定 Netlify Blobs store；不要覆盖运行中的生产库。恢复后检查公开版本、文件访问和互动计数，然后重新开放网站。密钥在环境变量中配置，不能放进命令行参数。

当前备份为小站规模的完整内存快照。大量长图或累计资料超过函数内存/执行时间后，应改为分批导出与数据库原生快照；部署前以实际文件规模验证。

## 官方参考

- [Netlify Database 入门](https://docs.netlify.com/build/data-and-storage/netlify-database/getting-started/)
- [Database API 和事务](https://docs.netlify.com/build/data-and-storage/netlify-database/api/)
- [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
- [Background Functions](https://docs.netlify.com/build/functions/background-functions/)

技术选择与配置按照以上官方资料及实际安装包接口核对。真实云端部署仍由用户完成后进行验收。
