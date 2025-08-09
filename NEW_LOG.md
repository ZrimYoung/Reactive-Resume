# 项目分析日志（简要）

- 日期：2025-08-09

## 已完成
- 梳理 Nx 工作区结构（apps: `client`、`artboard`、`server`；libs: `dto`、`schema`、`utils`、`ui`、`hooks`、`parser`）。
- 阅读关键配置与入口：`nx.json`、`package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、各 `project.json`、`apps/server/src/main.ts`、`apps/server/src/app.module.ts`、`apps/client/src/router/index.tsx`、`apps/client/src/libs/axios.ts`、`tools/prisma/schema.prisma` 等。
- 端到端数据流与业务模块：简历 CRUD 与打印（`ResumeController/Service`、`PrinterService`）、本地文件存储（`StorageService/Controller`）、字体上传与扫描（`FontService/Controller`）、语言列表（`TranslationService/Controller`）、用户信息（`UserController/Service`）。
- 前端路由与数据访问：客户端仪表盘/编辑器/公开页路由，React Query + Axios（`/api` 前缀，Vite 代理 `/artboard` 到 6173）。
- 打印与预览流程：Puppeteer 启动 → 注入 `localStorage.resume` → 加载 `/artboard/preview` → 逐页输出 PDF/截图 → 通过 `StorageService` 生成 URL。

## 变更（移除公开分享）
- 删除前端公开简历能力（本地部署不支持公开分享）：
  - 路由：移除 `:username/:slug` 路由以及 `PublicResumePage`、`publicLoader` 引用（`apps/client/src/router/index.tsx`）。
  - 服务：移除 `findResumeByUsernameSlug`（`apps/client/src/services/resume/resume.ts`）。
  - 页面：删除 `apps/client/src/pages/public/page.tsx`。
  - 保留 `apps/client/src/pages/public/error.tsx` 仅作为全局错误页使用。

## 关键发现
- 公开简历接口：前端存在 `/resume/public/:username/:slug` 的调用，服务端暂未实现对应控制器，属潜在功能缺口。
- 用户标识：服务端固定使用 `local-user-id`，客户端本地用户常量为 `local-user`；功能可用，但存在标识不一致的隐患。
- Prisma 种子：`package.json` 指向 `tools/prisma/seed.js`，仓库为 `seed.ts`，如需脚本方式种子，建议使用 `ts-node` 执行 TS 版本或补充 JS 文件。
- 字体 URL：`FontService` 通过替换端口构造完整 URL（5173→3000），在部分部署形态下可能不稳健，建议统一由 `STORAGE_URL`/反向代理提供稳定前缀。
- 安全边界：本地模式无鉴权；`StorageService` 做了路径安全检查与类型限制，但公开下载接口应关注访问控制（当前为本地桌面/离线模式问题不大）。

## 下一步建议
- 补全公开简历 API 或在前端按本地模式显式禁用该路径，避免 404。
- 统一客户端/服务端用户标识（或在客户端读取服务端 `/user/me`）。
- 调整 Prisma 种子脚本指向或提供 `tools/prisma/seed.js`；若使用 TS，建议命令：`pnpm ts-node tools/prisma/seed.ts`。
- 校验 `PUBLIC_URL` 与开发代理是否一致，保证打印服务访问 `/artboard/preview` 正常（需同时起 `client` 与 `artboard`）。
- 如需增强持久化与多用户，扩展用户认证与存储权限校验；字体删除与持久化也可进一步完善。

## 本次调整
- 统一字体资源 URL 构造：改为使用 `STORAGE_URL` 作为稳定前缀，不再通过 `PUBLIC_URL` 端口替换（5173→3000）。
  - 位置：`apps/server/src/font/font.service.ts`
  - 影响：
    - 上传后返回的 `FontResponseDto.url` 现在直接为绝对 URL（来源于 `StorageService.uploadObject`，已基于 `STORAGE_URL` 构造）。
    - 扫描磁盘恢复字体列表时，也用 `STORAGE_URL` 拼接 `/api/storage/...`，确保不同部署形态下一致。
    - 对历史相对 URL 做兜底补齐，兼容旧缓存。

# 项目分析要点（Reactive-Resume / Nx 19 + pnpm）

## 已完成的工作
- 通读 Nx 工作区结构、项目依赖与 targets
- 读取前后端关键配置（Vite、Nest 主入口、代理、配置校验）
- 梳理本地联调端口与访问路径
- 初步发现潜在改进点

## 工作区与项目结构
- 应用：
  - `apps/client`（React + Vite，端口 5173，含代理）
  - `apps/artboard`（React + Vite，端口 6173，`base: /artboard/`）
  - `apps/server`（NestJS + Webpack，端口 3000，Global Prefix: `/api`）
- 共享库：
  - `libs/{dto, schema, utils}`（@nx/js:swc，可在前后端复用）
  - `libs/{hooks, ui}`（React 相关，Vite 构建）
  - `libs/parser`（@nx/js:swc）
- 依赖关系（简要）：
  - `client` 依赖 `utils, ui, hooks, dto, schema, parser`
  - `server` 依赖 `utils, dto, schema`
  - `artboard` 依赖 `hooks, utils, schema, ui`

## 运行与联调
- 端口：
  - Client: http://localhost:5173
  - Artboard: http://localhost:6173（通过 `client` 的代理暴露为 `/artboard`）
  - Server API: http://localhost:3000/api
- 代理（`apps/client/proxy.conf.json`）：
  - `/api` → `http://localhost:3000`
  - `/artboard` → `http://localhost:6173`
- PowerShell 本地启动示例：
  - 终端 1：`pnpm nx serve server`
  - 终端 2：`pnpm nx serve client`
  - 可选 终端 3：`pnpm nx serve artboard`
  - 或并行前端：`pnpm nx run-many -t serve -p client,artboard --parallel`

## 构建、测试与发布
- 前端构建：@nx/vite（`client`, `artboard`, `hooks`, `ui`）
- 通用库构建：@nx/js:swc（`dto`, `schema`, `utils`, `parser`）
- 测试：前端使用 Vitest（@nx/vite:test），后端使用 Jest（@nx/jest）
- Lint：@nx/eslint:lint（全局配置）
- 发布：多库包含 `nx-release-publish` 目标，支持 npm 发布

## 服务端配置要点
- 配置校验：`apps/server/src/config/schema.ts`（zod）
  - 默认 `PORT=3000`
  - `PUBLIC_URL` 默认 `http://localhost:5173`
  - `SESSION_SECRET` 默认开发用值
  - `STORAGE_URL` 默认 `http://localhost:3000`
- CORS：
  - 若 `PUBLIC_URL` 为 HTTPS，则允许任意 HTTPS 域（正则）；否则仅允许 `http://localhost:3000`
  - 开发下通过 Vite 代理访问 API，可规避浏览器端 CORS 限制；若直接从 5173 调 API 会被限制

## 观察到的潜在问题/改进
- CORS 逻辑与 `PUBLIC_URL` 默认值存在不一致：
  - `PUBLIC_URL` 默认 5173，但非 HTTPS 情况仅放行 `http://localhost:3000`
  - 建议：从 `PUBLIC_URL` 解析出 `origin` 并加入允许列表；开发模式可显式加入 `http://localhost:5173`
- CI 命名输入：`nx.json` 的 `namedInputs.sharedGlobals` 引用 `.github/workflows/lint-test-build.yml`，仓库中未发现该文件（请确认是否缺失或路径变更）
- 提供 `.env.example` 并在 README 中明确变量说明（`PUBLIC_URL, STORAGE_URL, SESSION_SECRET` 等）
- 统一测试与覆盖率输出（Vitest 与 Jest）与报告目录，便于 CI 汇总

## 下一步建议
1) 在服务端按 `PUBLIC_URL` 解析 `origin` 并调整 `enableCors` 配置（提升可用性）
2) 补齐/校正 CI 工作流文件路径，确保 Nx 缓存 `sharedGlobals` 配置有效
3) 补充 `.env.example` 与运行文档，降低新成员上手成本
4) 若需要，增加统一脚本以并行启动多服务（兼容 PowerShell）

## 已修正
- 服务端 CORS：根据 `PUBLIC_URL` 动态允许来源，并在开发环境默认放行 `http://localhost:5173` 与 `http://localhost:3000`
- 新增 `.env.example`：补充本地开发变量示例
- （已删除）CI 工作流：`.github/workflows/lint-test-build.yml`；同步清理 `nx.json` 对 `sharedGlobals` 的引用与依赖

### 2025-08-08 打印导出缺失内容问题修复
- 症状：`/artboard/preview` 预览正常，但导出 PDF（使用 Puppeteer）时页面底部/部分区块消失（示例：`test/reactive_resume-cme335lt200019nyw3uvgteil.json`）。
- 根因：`apps/server/src/printer/printer.service.ts` 在 `page.pdf` 传入 `width/height` 为数字，Puppeteer 期望带单位的字符串，导致回退到默认纸张尺寸而发生裁剪；并且在把单页克隆到 `body` 后未再次精确测量高度。
- 处理：
  - 替换为 `"${width}px"/"${height}px"`，并启用 `preferCSSPageSize: true`、`margin: 0`。
  - 克隆单页后使用 `getBoundingClientRect + scrollHeight` 重新测量尺寸。
  - 注入仅打印兜底样式，强制 `[data-page]` 及子元素 `overflow: visible`，降低网格/负外边距导致的裁剪风险。
  - 文件：`apps/server/src/printer/printer.service.ts`。
  - Lint 已通过。

### 2025-08-08 矢量 PDF 保持（禁用截图方案）
- 说明：用户要求严格保持矢量 PDF，不可用截图。
- 改动：恢复 Puppeteer 原生 `page.pdf` 流程（矢量），尺寸仍使用像素字符串与零边距；合并多页时继续用 `pdf-lib` 复制页面以保持矢量属性。
- 额外：高度测量使用 `element/document.*scroll*` 的最大值，避免“在校经历”等被裁剪。

日期: 2025-08-08

已完成的分析

- Nx 工作区结构梳理：包含前端 `apps/client`、预览画布 `apps/artboard`、后端 `apps/server`，以及可发布的库 `libs/{ui,utils,schema,dto,parser,hooks}`。
- 发现重复/可合并点：
  - `helmet` 上下文在 `apps/client/src/constants/helmet.ts` 与 `apps/artboard/src/constants/helmet.ts` 完全相同，可抽到公共库。
  - `BrandIcon` 组件在 `apps/client` 与 `apps/artboard` 重复实现，逻辑相近，可合并为单一可配置组件。
  - Prisma 种子脚本同时存在 `tools/prisma/seed.js` 与 `tools/prisma/seed.ts`，且 `.js` 版本不完整，建议移除，仅保留 TypeScript 版并修正日志输出。
  - `apps/client/public` 中存在演示/素材资源（`templates/{jpg,pdf,json}`、`screenshots/`、`sample-resumes/`）未在运行时直接引用，建议下沉到文档或按需下载，减少仓库体积。
  - 各库内存在独立 `pnpm-lock.yaml`（如 `libs/ui/pnpm-lock.yaml` 等），在 Nx monorepo 下通常不需要，建议移除，统一使用根锁文件。
  - 重复的 `icon/` 静态资源在 `apps/client` 与 `apps/artboard` 各自维护，如有需要可改为共享资源或通过构建产物引用，减少重复。
  - `postcss.config.js` 在多个项目中重复，可尝试抽象为共享配置（若配置一致）。

本次执行（已完成）

- 删除冗余且不完整的 Prisma 种子脚本：`tools/prisma/seed.js`。
- 删除子包锁文件以统一根锁：`libs/{dto,hooks,parser,schema,ui,utils}/pnpm-lock.yaml`。
- 检查 `tools/prisma/seed.ts`：日志输出已正确（`console.log('示例简历已创建:', resume);`），无需修改。
- 移除服务端 Sentry（nest-raven）集成：删除 `apps/server/src/app.module.ts` 中 `RavenModule` 与全局 `RavenInterceptor`，并从 `package.json` 移除依赖。
- 删除贡献者模块：移除 `apps/server/src/contributors/*` 及其在 `app.module.ts` 的引入；删除前端 `apps/client/src/services/resume/contributors.ts`；从 `libs/dto` 移除 `contributors` 导出与类型。
 - 移除 Swagger：删除 `apps/server/src/main.ts` 中的 `SwaggerModule` 和 `DocumentBuilder` 初始化，以及 `patchNestJsSwagger` 引用；从 `apps/server/src/*/*.controller.ts` 移除 `@ApiTags`；从 `package.json` 删除 `@nestjs/swagger` 依赖。

建议的下一步行动

1) 公共化与去重
   - 新建 `libs/ui/src/components/brand-icon.tsx`，统一导出 `BrandIcon`（通过 `className/size` 控制大小），替换两端引用。
   - 新建 `libs/utils/src/helmet.ts`（或复用现有库），集中导出 `helmetData/helmetContext`，替换 `apps/*/src/constants/helmet.ts`。

2) 资产与样例精简
   - 将 `apps/client/public/templates/*`、`public/screenshots/*`、`public/sample-resumes/*` 迁移到 `docs/assets` 或通过脚本下载；默认不随源码分发。
   - 如保留运行期需要的少量示例，可改为懒加载或提供线上链接。

3) 脚本与锁文件整洁化
   - 删除 `tools/prisma/seed.js`（不完整且与 TS 重复）。
   - 修正 `tools/prisma/seed.ts` 中的日志输出（当前少了 `console.log` 调用）。
   - 删除各子包内 `pnpm-lock.yaml`，统一以根锁文件为准。

4) 构建配置
   - 比较 `apps/*/postcss.config.js`，若一致则抽出为共享配置包，由各应用引用。

风险与验证

- 合并 `BrandIcon` 与 `helmet` 需全局替换引用并通过 `apps/{client,artboard}` 构建与端到端验证。
- 删除公共资产前需确认没有运行时依赖；可先做一次全仓库引用搜索，再在本地完整跑通主要页面（`/dashboard/*`、公开简历页）。
- 删除子包锁文件后，以 `pnpm i` 验证一致性，跑通 `nx build/test/lint`。

后续可自动化工作（按安全顺序进行）

1) 删除 `tools/prisma/seed.js` 与子包 `pnpm-lock.yaml`
2) 新增共享 `BrandIcon` 与 `helmet`，替换引用
3) 资产迁移/精简并补充 README 引用
4) 抽取 `postcss` 共享配置（若可行）

可简化项清单（本次仅分析，未改动）

- 组件/常量去重
  - 合并 `BrandIcon` 为单一组件：抽到 `libs/ui/src/components/brand-icon.tsx`，提供 `size/className/debounce` 可配置；替换 `apps/client/src/components/brand-icon.tsx` 与 `apps/artboard/src/components/brand-icon.tsx`。
  - 合并 `helmet` 上下文：抽到 `libs/utils/src/helmet.ts`，删除 `apps/*/src/constants/helmet.ts` 两份重复。

- 样式与构建配置统一
  - 新增根级 `postcss.base.js`，各项目 `postcss.config.js` 统一 `module.exports = require('../../postcss.base')`（按路径调整）；`apps/artboard` 目前缺少 `postcss-import/tailwindcss-nesting`，统一后减少差异。
  - 评估 Tailwind 配置是否也可共享（保持 app 级别扩展覆盖）。

- 静态资源精简
  - 合并 `icon/` 与 `favicon.*` 到单处（建议 `apps/client/public/icon/`），`apps/artboard` 通过路径引用；避免重复维护。
  - 将大体积演示资源迁移到文档或按需下载：`apps/client/public/templates/{jpg,json,pdf}`、`public/screenshots/`、`public/sample-resumes/`；生产构建中排除或改为延迟加载链接。
  - 明确 `support-logos/linkedin.svg` 的落点（建议只在 `apps/client/public/support-logos/` 保留一份），其余品牌统一使用 `simpleicons`。

- Electron 主进程清理（`electron.js`）
  - 移除重复定义的 `checkServerConnection`（保留带 host/port 的版本）。
  - 移除未使用的 `spawn` 与 `serverProcess` 变量；将等待/错误页 HTML 提取为模板文件或常量。
  - 控制台日志收敛到 `DEBUG_ELECTRON` 环境开关，默认静默。

- 依赖与脚本
  - 移除未使用依赖：`electron-is-dev`（当前使用 `app.isPackaged`）。
  - 仅保留一种 Vite React 插件：二选一 `@vitejs/plugin-react` 或 `@vitejs/plugin-react-swc`（推荐 SWC）。
  - 用 Nx 自定义 target 封装 Electron 启动，精简顶层 `package.json` 的多个 `electron*` 脚本。

- 调试/测试代码
  - 移除或加守卫的接口：`POST /resume/:id/debug`（仅在 `NODE_ENV!=='production'` 暴露或直接删）。
  - 系统性收敛 `console.log` 调试输出（保留关键错误与启动日志）。

- 数据与临时文件
  - 将 `tools/prisma/local-resume.db` 移出仓库并加入 `.gitignore`；保留 `migrations/*` 与 `schema.prisma`。
  - 若存在子包锁文件，统一删除，仅保留根 `pnpm-lock.yaml`（当前已无）。

- 服务器小优化
  - `apps/server/src/app.module.ts` 中的 `resolveStaticRoot` 可提取到 `src/utils/path.ts`，便于复用与测试。

建议执行顺序
1) 删除测试/调试代码与未使用依赖（`electron-is-dev`、`resume/:id/debug` 等）。
2) 合并 `BrandIcon` 与 `helmet` 到共享库并替换引用。
3) 统一 `postcss` 配置并校验两端样式一致性。
4) 整理静态资源（合并图标与迁移演示资源）。
5) 精简 Electron 主进程与脚本，按需引入模板页。

验证建议
- 运行 `pnpm i` 后执行 `nx run-many -t build,lint,test`；再验证 `pnpm electron:dev` 正常启动。
- 手测主要路径：`/dashboard/*`、公开简历路由、打印预览与导出。

