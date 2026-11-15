# 离线 exe 启动、画布与打印修复验收

修复工作树：`E:\Git\Reactive-Resume-offline-repair`；分支：`codex/offline-exe-repair`。

该工作树基于此前已授权的改动快照，并选择性同步另一个聊天已稳定的保存、草稿、离线字体和 Markdown 功能。切换工作树后未继续修改原项目目录。实施前快照位于 `E:\Git\.local-backups\reactive-resume-offline-repair-start-20261115`。

## 可运行交付

- 单文件免安装版：`dist-electron/offline-fix-20261116/Reactive Resume 4.4.6.exe`。
- Windows x64；232,818,406 字节（约 222 MiB）。
- SHA256：`3425EDD44B8D39C84EEA2C98B0DE6E90C4A926E20FE2D19BD4A0E70D8A6C4CD1`。
- 同目录包含 `SHA256SUMS.txt` 和 `offline-package-manifest.json`。
- 正常使用不需要开发目录、Node.js、独立数据库服务或下载打印用 Chrome。程序数据保存在本机用户数据目录；本次验收通过环境变量将其隔离至测试目录。

## 已确认的原因与修复

1. **旧包找不到 Prisma 生成客户端。** 真实使用旧包自身 Electron 复现 `Cannot find module '.prisma/client/default'`。运行时 `NODE_PATH` 缺少 `resources` 父目录；现已固定，且不再运行时向安装目录复制数据库组件。
2. **首次启动依赖预先存在的数据库。** 新增幂等 SQLite 建表和本地用户初始化，空数据目录可直接使用；重复启动保持原有简历不变，并覆盖旧单用户 ID 的兼容回归。发行包不再携带开发者数据库或用户 `storage`。
3. **打印故障会阻止整个应用打开。** 新增只检查数据库和存储的启动就绪接口；Chrome 改为按需启动。启动检测验证本次后端实例标识，避免端口上其他程序返回 HTTP 200 被误认为本应用。启动失败界面支持重试及打开日志。
4. **画布加载竞态与旧数据残留。** 移除浏览器无保证的 `setImmediate` 和持续轮询，以 iframe 握手发送最新数据；编辑画布与打印页隔离 localStorage；兼容补全旧简历嵌套设置。纸张按真实自定义尺寸及横竖方向计算，初始视图自动适应编辑区域。
5. **重启后字体或图片失效。** 上传字体增加元数据持久化、正确存储目录和恢复单飞；按当前端口生成本机资源地址。Axios、画布、打印输入均处理旧 loopback 存储 URL。字体和品牌图标使用本地资源，字体缺失有有限等待和回退。
6. **并发打印串稿、失败泄露页面、长简历裁切。** Chrome 启动单飞，每个任务用独立 BrowserContext；等待画板和字体明确就绪，并在 `finally` 清理。移除将长内容缩放后裁掉的逻辑，保留自然分页。修正自定义横向纸张，按简历 ID 存储 PDF，避免同名简历覆盖。
7. **桌面 JSON/Markdown 导出与 PDF 入口不统一。** 导出统一支持 data/http/https；先写临时文件，成功后替换目标，失败不破坏旧文件。底部打印按钮同样使用桌面保存接口，并保留导出前保存队列确认。
8. **打包阶段缺少真实运行验证。** 固定匹配 Puppeteer 的 Chrome 与相对路径 manifest。构建前校验必需文件，afterPack 使用包内 Electron 加载所有后端外部依赖、执行新 SQLite 查询，并禁止模块解析逃回开发目录。增加 portable-only 目标，使用本地 Electron 文件。

用户提供的 `tmp/second-batch-validation-20261115/ipc-smoke.cjs` 弹窗另属并行聊天临时验证脚本的相对路径错误。已协调修复并清理其测试进程；本次打包验收均使用隐藏窗口及顶层错误日志。

## 验证结果

- 9 个项目整体构建通过；最后的客户端旧资源端口修复也单独构建通过。
- Vitest：22 个文件、157 项测试全部通过。
- Electron/Node 底层：10 项测试通过，覆盖退出保护、草稿、导出、启动实例及端口检测。
- 真实 Chrome 冷渲染与并发打印：延迟 600ms 的画板仍正确等待；长简历 4 页、短简历 1 页，不同纸张尺寸正确。
- 独立 unpacked exe：干净数据目录初始化、默认端口被占用时启动、画布完整适应区域、切换简历不串稿、中文 JSON 经真实 IPC 保存、并发 PDF、换端口重启后简历/字体/头像/PDF 均通过。
- 人为移走诊断包的打印 manifest 后，应用仍能打开简历库；测试后已恢复文件。
- **最终单 exe** 被复制至包含中文和空格的目录，使用中文测试数据路径，完整执行上述首次启动、画布、导出、关闭与重启流程，全部通过。
- 最终 exe 真正运行于 `C:\Users\Zrim\AppData\Local\Temp\...\resources`，验证不依赖仓库祖先目录里的 `node_modules`。
- 测试副本与交付 exe 的 SHA256 完全一致。

验收通过失败代理及拦截外网请求模拟离线，不改变系统网络。桌面文件选择器在测试进程中替换为指定测试路径，以验证真实 IPC 和写文件链路；未人工点选系统文件窗口。

## 可复查证据

- `tmp/offline-exe-acceptance/result.json`：最终 portable 验收、真实临时运行路径。
- `tmp/offline-exe-acceptance/startup-without-printer.json`：打印组件异常不阻断启动。
- `tmp/offline-printer-validation/result.json`：冷渲染、长内容及并发打印。
- `tmp/offline-exe-acceptance/run.cjs`：可复跑的真实 exe 验收；仅测试时启用隐藏窗口、隔离数据和调试端口。
- `E:\Git\.local-backups\reactive-resume-offline-repair-start-20261115\`：构建、单测、底层测试及 packaged/portable 验收日志。

内置字体及已上传/准备的字体可离线使用。额外在线字体只有用户主动准备时才联网，缺少字体缓存时使用本地回退。

以上为独立修复工作树完成时的记录，当时尚未向原分支合并、提交或推送。后续经用户授权整合回原目录，保留保存/草稿接口、`resumeFonts` 与 `artboardReady` 协议；最新验证与自己仓库主分支的整合结果见 `OWN_MAIN_INTEGRATION_20261116.md`。
