# 已有 Netlify 站点修复

适用站点：`https://yusnshen.netlify.app`。修复已在本地验证，尚未上传你的 GitHub 仓库或部署到你的账号。

## 1. 更新 GitHub 文件

1. 解压 `deliverables/teyvat-netlify-fix.zip`。这是修复源码包，不能直接拖进 Netlify。
2. 打开 `https://github.com/a3139483642-droid/genshin-guide`，切换到 `main` 分支，停留在能看到 `package.json` 的目录。
3. 点击 **Add file → Upload files**。
4. 将解压后里面的所有文件和文件夹一起拖入上传区，包括 `package.json`、`package-lock.json`、`netlify.toml`、`server`、`netlify`、`scripts`、`tests`、`docs`。保持原有目录结构，不要上传 ZIP 或包外层的文件夹。
5. 点击 **Commit changes**，提交到 `main`。同名文件会更新；包中没有的文件保留。

## 2. 等待重新部署

1. 打开 Netlify 的 `yusnshen` 项目，点击 **Deploys**。
2. GitHub 提交通常会自动触发部署。没有新部署时点击 **Trigger deploy → Deploy project**。
3. 等待这一次新部署显示 **Published**，确认时间是刚刚更新后的时间。

## 3. 检查是否恢复

打开 `https://yusnshen.netlify.app/api/status`。

- 出现 JSON，包含 `needsSetup`、`local:false`：数据库已连通。刷新首页后应看到 8 位初始角色。
- 出现“数据库尚未连接”：展开 **Data & Storage → Database**，确认生产数据库已创建且启用；没有数据库就先创建，随后重新部署。
- 仍出现“服务暂时不可用”：打开 **Cloud compute → Functions → api**，查看最新函数错误日志。浏览器 Console 的 500 只说明后端失败，函数日志才有直接原因。无需发送数据库连接串或密码。

如果 `needsSetup:true`，打开站点 `/setup` 创建站长。首次初始化所用密钥是 Netlify 的 **Environment variables** 中的 `SETUP_KEY`，不是 GitHub 或 Netlify 登录密码。没有该变量时，通过 **Add a variable → Add a single variable** 添加随机密钥，保存后重新部署；至少 32 个字符，保留 Functions 作用域。不要将密钥放入仓库或带 `VITE_` 前缀的变量。

已有站长时不需要重新初始化。更新源码不会清空数据库。

## 修复内容和验证

- 迁移到现代 Netlify Functions 运行时，自动读取托管数据库连接及私有 Blobs 配置。
- 支持 Netlify.env 平台环境变量；数据库初始化失败后释放连接并允许重试。
- 升级 HTTP 适配器，修复 Express JSON 请求体兼容问题。
- 调整 ESM 文件路径与 DOCX/PDF 依赖打包方式，保留解析线程。
- 全部 19 项测试通过；Netlify 离线构建检查全部 5 个函数为 runtime API 2；实际函数 ZIP 验证 API、JSON 初始化、SEO 与 DOCX 后台解析。

官方依据：[Database 环境排错](https://docs.netlify.com/build/data-and-storage/netlify-database/troubleshooting/)、[withLambda 现代运行时支持](https://docs.netlify.com/build/functions/api/)。
