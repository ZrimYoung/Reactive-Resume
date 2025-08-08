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


