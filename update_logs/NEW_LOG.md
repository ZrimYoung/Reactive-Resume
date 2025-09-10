# 更新记录

- 时间: 自动生成
## 2025-09-06 本地单用户化：彻底移除账户功能

- 前端
  - Sidebar 与 UserAvatar 切换为 `useAuthStore` 本地状态（移除 `useUser` 依赖）。
  - 删除设置页 `AccountSettings`、`SecuritySettings` 两个小节及引用。
  - 将 `ProfileSettings` 改为纯本地：主题与语言保存在本地（`useTheme`/`localStorage` + `useAuthStore`）。
  - 删除前端用户服务目录：`apps/client/src/services/user/*`。
  - 取消 Axios `withCredentials` 配置。

- 后端
  - 删除 `apps/server/src/user/*`（控制器/服务/模块/装饰器）。
  - 从 `app.module.ts` 移除 `UserModule`。
  - `main.ts` 移除 `cookie-parser` 与 `express-session`，CORS 去掉 `credentials`。
  - `config/schema.ts` 移除 `SESSION_SECRET`。
  - 删除 `Request.user` 类型扩展，仅保留 `payload.resume`。
  - 清理依赖：从 `package.json` 移除 `cookie-parser` 与 `express-session` 及其类型。

- 影响
  - 不再存在任何账户/鉴权行为；用户信息只作为本地偏好存在。
  - 简历数据仍与固定 `local-user-id` 关联，数据库模型未改动（保持最小变更）。

- 验证建议
  - 运行 `pnpm i` 后执行 `nx run-many -t build,lint`；再手测 `/dashboard/*` 与简历 CRUD/打印。

- 修改: 统一导入接口返回的 ResumeDto.data 为对象；前端在创建/导入成功时对写入缓存的数据做兜底规范化，避免 builder loader 命中新鲜但不规范（字符串）的 data。
- 影响: 解决新建样例/复制/导入后立刻进入编辑页报错、刷新后恢复的问题；正常新建不受影响且更稳健。
- 涉及: apps/server/src/resume/resume.service.ts, apps/client/src/services/resume/create.ts, apps/client/src/services/resume/import.ts
- 2025-08-13 修复编辑器双侧折叠导致画布与按钮消失问题：
  - 保持左右 `Panel` 始终渲染，折叠时宽度设为 1%，避免 `PanelGroup` 仅剩单面板引发行为异常（编辑 `apps/client/src/pages/builder/layout.tsx`）。
  - 两个 `PanelResizeHandle` 始终存在，确保面板结构完整；中间 `Panel` 的默认宽度根据左右面板尺寸动态计算。
  - 提升左右浮动折叠按钮的层级至 `z-[70]`，防止被内容遮挡。
  - 将编辑器 iframe 宽度由 `w-screen` 调整为 `w-full`（编辑 `apps/client/src/pages/builder/page.tsx`），避免布局溢出导致的异常。
  - 通过 ESLint 校验，无新增告警/错误。

下一步建议：
- 将左右折叠状态持久化到本地存储以增强体验；
- 如果需要折叠状态下允许通过拖拽恢复宽度，可将折叠宽度从 1% 改为更易命中的最小宽度并提供 hover 提示；
- 补充 e2e 用例覆盖“依次折叠左右侧栏”的场景。
2025-08-09 自定义 CSS 检查（不修改）

- 目标：检查 `test/reactive_resume-cme335lt200019nyw3uvgteil (4).json` 中 `metadata.css.value` 的选择器是否匹配 Gengar 模板，验证 CSS 注入逻辑。

已做工作
- 核对 Gengar 模板 DOM：`.sidebar`、`.main`、`.p-custom`、`<section id=...>`、`.wysiwyg` 均存在且与选择器匹配。
- 确认自定义 CSS 注入：在 `apps/artboard/src/pages/artboard.tsx` 里使用 `<style id="custom-css">` 注入，并确保位于 `<head>` 末尾（有移动到尾部的副作用）。

发现的潜在风险/改进点（仅记录，不修改）
- 全局 `* { color: ... !important; }` 可能覆盖主题文本色（含 `.sidebar` 顶部蓝底区域的白字），建议后续考虑缩小作用域或减少 `!important`。
- 字体 `'OPPO Sans 4.0'` 未在当前应用内显式加载，PDF/无该字体环境将回退到系统 sans-serif。
- 想“移除 section 间距”的规则 `.main .p-custom > section { margin-bottom: -8px; }` 对 Tailwind 的 `space-y-4`（使用兄弟选择器设置 margin-top）不完全生效，后续如需严格控距建议改为覆盖 `section + section` 的 `margin-top`。
- 若未来更换模板/类名，像 `.sidebar .flex.flex-col.items-start.gap-y-2` 这类“精确到多个类名”的选择器稳定性较弱。

新增问题定位（依据用户给出的 HTML，纯分析）
- 主体列 Section 间距未按预期变化：
  - 根因：`.main .p-custom` 容器使用 `space-y-4` 产生的是“兄弟元素的 margin-top”，而现有自定义 CSS 调整了每个 `section` 的 `margin-bottom`，二者不冲突，导致无效。
  - 证据：模板中有 `"p-custom space-y-4"`（主体与侧栏均有）。
    ```
    598:605:apps/artboard/src/templates/gengar.tsx
    <div className="p-custom space-y-4"> ... </div>
    ```
- 每个 Section 内条目块之间的间距未明显减小：
  - 根因：每个 Section 内部使用了 `grid gap-y-3` 产生“行间隙（row-gap）”，这不是子元素 margin 能覆盖的，需要直接覆盖容器的 row-gap。
  - 证据：模板条目容器为 `grid gap-x-6 gap-y-3`：
    ```
    195:199:apps/artboard/src/templates/gengar.tsx
    <div className="grid gap-x-6 gap-y-3" style={{ gridTemplateColumns: `repeat(${section.columns}, 1fr)` }}>
    ```
- 条目内部标题与正文之间的细小间距：
  - 现有规则 `.main .space-y-2 > * + * { margin-top: 3px !important; }` 可覆盖大多数由 `space-y-2` 带来的 `margin-top`，一般有效；但视觉上仍可能被上层 `gap-y-3` 的行间隙掩盖。

后续可选对策（待确认再实施）
- 取消主体列 Section 间距（等价移除 `space-y-4`）：
  - 方案 A（较稳）：覆盖兄弟选择器的 `margin-top`，如：`.main .p-custom > section + section { margin-top: 0 !important; }`。
  - 方案 B（更通用）：`.main .p-custom > :not([hidden]) ~ :not([hidden]) { margin-top: 0 !important; }`。
- 减少 Section 内条目行与行的距离：
  - 直接覆写条目容器的 row-gap：`.main section .grid { row-gap: 2px !important; }`（或更小/更大按需）。
- 如需侧栏也同步减距：
  - 追加侧栏容器：`.sidebar .p-custom > :not([hidden]) ~ :not([hidden]) { margin-top: 0 !important; }` 与/或 `.sidebar section .grid { row-gap: 2px !important; }`。

建议下一步（待确认再实施）
- 限缩全局颜色覆盖或去掉 `!important`，避免与主题色冲突。
- 通过自定义字体上传或在 `metadata.typography.font.family` 中统一配置并加载 `'OPPO Sans 4.0'`，保证跨端一致性。
- 使用 `section + section` 或覆盖 Tailwind `space-y-*` 生成的兄弟选择器来精确控制模块间距。

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
- 打印/导出一致性改造（允许自动分页 + 全页合并 + CSS 注入顺序一致）：
  - 服务端：
    - `apps/server/src/printer/printer.service.ts`
      - `page.pdf` 改为 `preferCSSPageSize: true`，不再强制 `width/height`，允许浏览器按 `@page` 自动分页。
      - 隔离当前 `data-page` 时用具名 `<style id="puppeteer-page-isolation">`，并在结束后精准移除，避免误删自定义 CSS。
      - 合并 PDF 时复制每次生成的“全部页”（不再只复制第 0 页）。
  - 前端（Artboard）：
    - `apps/artboard/src/pages/artboard.tsx`
      - 注入 `<style id="print-page-size">`，按简历设置计算 `@page { size: ..; margin: 0 }`，保证打印尺寸与方向一致。
      - 继续确保 `<style id="custom-css">` 在 `<head>` 末尾，保持覆盖优先级。

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

### 2025-08-09 打印导出内容缺失问题修复
- 症状：`/artboard/preview` 预览正常，但导出 PDF 时页底或某些区块缺失（尤以自定义 CSS 时明显）。
- 根因：预览是“无限高画布”，打印强制固定纸张；超出部分被裁掉。另外当浏览器因 `@page` 自动分页时，合并逻辑只复制了第 0 页，导致额外页被丢弃。
- 处理：允许自动分页（`preferCSSPageSize: true` + 注入 `@page`），并在合并阶段复制全部页；确保自定义 CSS 始终在 `<head>` 末尾。

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

## 速记：Puppeteer page.pdf 的 pageRanges 说明（2025-08-09）
- `pageRanges: "1"`：只导出第 1 页（页码从 1 开始）。
- 可用示例：`"1-3,5,7-9"` 表示导出第 1 至 3、5、7 至 9 页。
- 若希望导出所有页：删除该参数或留空（即不传 `pageRanges`）。
 - 若希望导出所有页：删除该参数或留空（即不传 `pageRanges`）。

2025-08-13 Electron 打包后后端无法启动的定位与修复（已修改）

- 已做工作
  - 在 `electron.js` 中为后端子进程补齐 `NODE_PATH`（新增包含路径）：
    - `resources/app.asar/node_modules`
    - `resources/app.asar.unpacked/node_modules`
    - `userData/node_modules`（已存在）
    - `resources/app.asar.unpacked/node_modules/.prisma/client`
  - 目的：确保子进程可解析 `@nestjs/*`、`@prisma/*` 等依赖，解决打包后 `Cannot find module` 类错误。
- 验证
  - 已执行：`pnpm run preelectron:build`（准备 Puppeteer + Nx 构建）、`pnpm run electron:build`（dir 目标，生成 win-unpacked）。
  - 已启动最新 `win-unpacked/Reactive Resume.exe` 进行本地验证（观察日志中）。
- 下一步建议
  - 若仍出现后端启动异常，请检查 `%AppData%/Reactive Resume/logs/backend.log` 与 `electron-main.log`。
  - 如遇 Prisma 引擎错误，确认 `asarUnpack` 已包含 `@prisma/engines` 与 `.prisma/client`，以及主进程设置的 `PRISMA_ENGINES_*` 环境变量是否生效。

2025-08-13 修复 Prisma 引擎类型导致后端崩溃（已修改）

- 现象
  - 打包后应用启动时，后端子进程秒退，前端显示“无法连接服务器”。
  - `backend.log` 报错：Invalid client engine type, please use `library` or `binary`。
- 根因
  - 主进程为后端子进程设置了 `PRISMA_CLIENT_ENGINE_TYPE=binary`，而 Prisma 5 客户端在本地 Node 环境需要使用 `library`（Node-API）。
- 修改
  - `electron.js`：将 `childEnv.PRISMA_CLIENT_ENGINE_TYPE` 从 `'binary'` 改为 `'library'`（保持 `PRISMA_QUERY_ENGINE_LIBRARY` 指向 unpacked 的 dll）。
- 影响
  - 后端将以 Prisma LibraryEngine 运行，避免初始化时抛出“Invalid client engine type”并退出。
- 追加修复（Windows 文件名校正）
  - 发现 Prisma 在 Windows 下的 Node-API 库文件实际为 `query_engine-windows.dll.node`（无 `lib` 前缀）。
  - 将 `electron.js` 中 `PRISMA_QUERY_ENGINE_LIBRARY` 从 `libquery_engine-windows.dll.node` 修正为 `query_engine-windows.dll.node`，与打包产物一致。
- 验证步骤（PowerShell）
  - 执行：`pnpm run preelectron:dist`
  - 执行：`pnpm run electron:dist`
  - 启动打包产物后检查日志：
    - `%APPDATA%/\@reactive-resume/source/logs/backend.log` 应出现 Nest 启动完成日志与监听端口。
    - `%APPDATA%/\@reactive-resume/source/logs/electron-main.log` 不再出现 60 次轮询失败。

# 变更记录（自动）

- 日期：2025-08-16
- 修改范围：`electron.js`
- 背景：CI/CodeQL 报告“Clear-text logging of sensitive information（明文记录敏感信息）”。

## 已完成
- 移除/改写了将环境变量或敏感路径明文输出到日志的代码：
  - 不再输出 `process.env.NODE_PATH`，改为仅输出段数量。
  - 启动后端时关于数据库/存储路径的日志改为泛化描述，不含具体值。
  - Prisma 引擎配置日志改为不包含具体路径。
- 全仓库检索未发现其它直接将 `process.env.*` 输出到日志的用法。

## 建议的下一步
- 重新运行 CodeQL 扫描确认告警消除。
- 对日志输出做一次总览，确保未来新增日志遵循“只记结构/状态，不记具体值”的原则。