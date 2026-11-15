# 离线修复与两批改进整合（2026-11-16）

## 合并范围

用户指定目标为自己的 `ZrimYoung/Reactive-Resume` 的 `main`。`origin` 指向该仓库；`upstream` 指向 `AmruthPillai/Reactive-Resume`，不向后者推送。

将隔离工作树的离线启动、画布、上传资源、打印与打包修复，逐文件整合回 `feature/electron-offline`。保留原目录较新的保存队列、磁盘草稿、显式恢复副本、字体许可证提示、Markdown 导出与中英文文案，不以旧修复树覆盖原目录。

另外修复故障退出边界：编辑页被加载页替换或 renderer 崩溃后，关闭保护清除旧就绪状态，解除旧页面的等待。主文档导航提交后才重置；SPA、iframe、被取消的导航不影响当前编辑页的保护。新编辑页重新就绪后仍需确认保存或耐久草稿，旧回执不能绕过检查。

## 整合验证

- `pnpm build`：9 个项目通过。
- `pnpm test --maxWorkers=2 --minWorkers=1`：25 个文件、165 项通过。
- `node --test electron/desktop-runtime.test.cjs electron/draft-storage.test.cjs electron/close-guard.test.cjs electron/download.test.cjs`：21 项通过，其中关闭保护 13 项。
- `pnpm exec lingui compile --strict`：中英文目录通过。
- 差异空白、修改后的 Node 入口语法检查通过。
- 暂存源码未包含数据库、用户 storage、测试数据、构建产物或匹配常见凭据模式的内容。

## 发行包

从整合后的原目录构建 Windows x64 单文件免安装版：

`dist-electron/main-integration-20261116/Reactive Resume 4.4.6.exe`

包内检查使用发行包自己的 Electron 加载后端依赖并执行 SQLite 查询，禁止依赖解析逃回开发目录；同时检查内置 Chrome 清单和必需资源，禁止附带开发者数据库与 storage。

最终 exe 为 232,828,219 字节；SHA256：

`A414D8C32201EF410A4B6DE0B53D0CF561C8ECE875BF68CC48738BB927AAE69A`

测试副本与交付文件哈希一致，放置在含中文和空格的路径，以独立中文数据目录实际运行；运行组件从系统临时目录加载，不依赖仓库祖先目录的开发依赖。以下检查全部通过：

1. 干净数据目录首次打开、默认 3000 端口被占用。
2. 画布初始适应编辑区域，切换简历不串稿。
3. 真实编辑器修改成功保存；模拟保存请求失败后磁盘草稿完整，显式重试后保存成功并清理草稿。
4. 中文 JSON 经真实 renderer/IPC 原生保存链路写入文件。
5. 并发真实 PDF 导出：长简历 4 页、短简历 1 页，自定义横向纸张尺寸正确。
6. 换端口重启后简历、上传字体、头像和 PDF 仍可用。
7. 精确结束测试后端后，加载故障页可正常关闭，不再等待旧编辑页。

离线通过失败代理和外部请求拦截模拟，未切断系统网络。仅在隔离测试进程中替换操作系统文件选择器的返回路径，实际文件选择窗口未人工点选；未测试安装版升级流程。首次退出验收脚本保持 Node 调试连接导致进程结束判断超时，调整为先确认窗口关闭、再断开调试连接后，同一 exe 复验全部通过，无需修改发行文件。

## 自己仓库主分支的集成校验

原 `main` 可快进至已抓取的 `origin/main`。后者独有业务差异仅涉及依赖声明和锁文件；合并 `feature/electron-offline` 时保留已验证的 Axios 1.21.1、当前锁文件和 overrides。合并验收要求主分支最终 Git tree 与本次已验证的 feature tree 完全一致，并保留原 `origin/main` 的祖先历史；只向 `origin main` 正常推送，不改写历史。

## 本地证据与保护

- `E:\Git\.local-backups\reactive-resume-before-main-integration-20261116/`：整合前 102 份文件、完整差异补丁，以及本次构建、测试与打包日志。
- `tmp/main-integration-acceptance/run.cjs`：最终包的隔离自动验收脚本。
- `tmp/main-integration-acceptance/result.json`：最终单 exe 的实际运行验收结果和系统临时运行路径。
- 原隔离修复树及其已验证 exe 保留，原用户数据未用于本次测试。
- 前两批改进及隔离修复的过程记录，分别见本目录的 `UPSTREAM_BACKPORTS_20261115.md`、`UPSTREAM_BACKPORTS_BATCH2.md`、`OFFLINE_EXE_REPAIR_20261116.md`；其中“未提交/未合并”为当时状态。
