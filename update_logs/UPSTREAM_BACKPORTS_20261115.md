# 桌面离线版上游更新移植（2026-11-15）

基于 `feature/electron-offline` 的 `cbe42a816`，选择性适配上游更新，继续使用 Electron、NestJS、本地 SQLite 和现有简历数据格式。

## 本批更新

- 12 个模板在条目全部隐藏时不再显示空章节标题。
- Gengar 摘要遵循布局中指定的栏目和页面，修正重复边距。
- 普通链接和自定义字段链接完整换行，不截断文字或改变地址。
- 基础信息、摘要、标准及自定义章节支持独立折叠和全部展开/收起。导航到某章节时自动展开。
- 折叠状态只放在编辑器 UI store，不修改简历、不触发自动保存或增加撤销历史，隐藏时保留字段挂载。
- 技能、兴趣、自定义栏目标签支持鼠标拖柄跨行排序、键盘拖放、Alt + 方向键排序。删除按钮独立，兼容重复导入标签。
- 简历库记住网格/列表显示偏好。
- 修复 LinkedIn 数组式网址末尾方括号残留。
- RichInput 粘贴时清理 Word / Google Docs 的来源颜色、字体和字号；保留正文、强调、链接、编号起点和嵌套列表。补充修复列表间正文换位和 Word 多级列表被压平的问题。
- 修正前端生产构建将 `path`、`fs` 等依赖留作浏览器裸导入的问题，恢复生产版画板加载和 PDF 导出。
- 增加 Vitest workspace，让现有 `pnpm test` 同时执行各子项目的回归测试。

## 来源

- 上游 v4.5.5：`8efc243e`（隐藏条目）、`2de24d5b` / `f6dc3bf8`（Gengar）、`80932eb8`（链接边界，仅借用修复意图，采用完整换行）。
- `4c0cc947` / `91ef87b4` / `1cc1c399`（章节折叠）、`a8626e40`（标签排序意图，改用现有 Dnd Kit 实现鼠标及键盘交互）、`e8d0ed13`（视图记忆）、`a23dbfa3`（LinkedIn 网址）。
- [v6.1.0 粘贴处理](https://github.com/reactive-resume/reactive-resume/blob/v6.1.0/apps/web/src/components/input/pasted-html.ts)，适配 Tiptap 2 和当前 DOM 类型配置，保留现有工具栏。

## 依赖

保留现有主版本和 `pnpm.overrides`，更新 package 与 lock：

- Axios：锁定版本 1.9.0 → 1.21.1。
- React Router：7.1.5 → 7.18.5。
- Vite：5.4.14 → 5.4.21。
- Electron：36.4.0 → 36.9.5，已下载对应运行文件。

以上为当前主版本内的更新，不代表整套技术栈已升级到各依赖最新主版本。

## 验证结果

- `pnpm test --maxWorkers=2 --minWorkers=1`：8 个文件、92 项测试全部通过，其中工具函数 43 项、模板 27 项、编辑器交互 5 项、粘贴处理 17 项。
- `pnpm build`：9 个项目构建通过。此环境使用 `NX_DAEMON=false`、`NX_NO_CLOUD=true`、短路径 `NX_SOCKET_DIR=E:\Git\.nx`。
- 真实 Chrome 模板测试：12 个模板、48 条长链接，文本和 href 完整，换行且不超栏目/A4 页面。
- 独立 SQLite 测试实例的页面流程：视图偏好刷新保留、单独/全部折叠且不保存文档、粘贴内容与强调保留并自动保存、标签键盘排序、鼠标跨行拖排后保存、PDF 生成下载，均通过，未捕获页面异常。
- Electron 36.9.5 隐藏窗口：应用加载及 preload 的 `isElectron`、`openJson`、`downloadAndSave` 接口检查通过，未记录渲染错误。
- 本批 TypeScript/TSX 文件的限定 ESLint、Prettier 检查通过；新增修改通过差异空白检查。原 `electron.js` 中已有的尾部空白按原样保留。

浏览器、Electron、PDF 和测试数据库产物位于被忽略的 `tmp/backport-validation-20261115/`；构建和测试日志位于 `E:\Git\.local-backups\reactive-resume-before-backports-20261115/`。未构建或安装新的安装包，未验证原生文件选择对话框和安装升级流程。

## 现有工作保护

实施前的 8 个未提交文件及完整 patch 已备份至 `E:\Git\.local-backups\reactive-resume-before-backports-20261115/`。其中 6 个源码文件逐字节保持不变；package/lock 保留原离线图标和数据库打包配置，仅叠加本批依赖更新。未提交、推送或更改分支。

后续可独立安排草稿恢复、Word 导出和 Forme 渲染引擎迁移，本批未引入新版账号、在线分享或数据库架构。
