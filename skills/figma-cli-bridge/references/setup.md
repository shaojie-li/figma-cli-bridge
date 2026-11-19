# 初始化与恢复

## 从完整 ZIP 安装

将 ZIP 内的整个 `figma-cli-bridge` 文件夹放入 `~/.codex/skills/`（设置了 `CODEX_HOME` 时用其下的 `skills/`）。打开一个新的 Codex 对话，输入「用 $figma-cli-bridge 准备本机 Figma 连接」，按返回的实际 manifest 路径首次导入插件。

从旧 Skill 升级时，将原 `figma-local-design` Skill 目录移出 Codex 的 skills 目录，再解压新包。保留已有 bridge 安装及其 `.local`，其中保存了配对与绑定。

## 准备运行环境

前置为 Python 3、Node.js 22+、npm、本机 Figma 桌面版及可编辑的 Design 文件。自定义主题需能在 Figma 加载所用字体；Luigi 示例使用 Noto Sans SC Regular。首次 npm ci 通常需要网络。macOS 优先检查用户已有 nvm/Homebrew 环境；缺工具时说明实际缺项。明确指定的目录优先。存在多个已知安装时，优先复用可认证的本机服务；冷启动优先考虑 Figma 已登记的安装。全新安装使用 `~/.local/share/figma-cli-bridge/bridge`。不要从不明 GitHub 仓库猜测安装来源。

| state | 当前对话执行 |
| --- | --- |
| bridge_missing、dependencies_missing、service_stopped、build_required | 运行 prepare，再按输出处理。首次服务在 127.0.0.1:38475 监听，构建产物和配对信息留在该安装。 |
| directory_in_use、bridge_upgrade_required | 保留原文件。检查用户已有安装、版本和本地改动。空闲时可选新的空目录 prepare；迁移已有绑定时评审源代码差异，仅更新必要代码，保留 .local。不要把两个安装指向同一端口或复制凭据。 |
| service_upgrade_required、pairing_expired | 读本安装 CLI status 和 .local/connection.json 的 pid；核实进程命令、cwd、监听端口和队列。确认是本实例且无运行/排队任务后，优雅终止该服务，再 prepare。仍在执行的先 wait，unknown 保留原记录恢复。 |
| port_occupied_or_auth_failed、custom_state_directory | 核对实际安装、状态目录和监听者，不接管其他服务。构建与服务都应使用所选安装的 .local。 |
| manifest_import_required | Codex 已检查本机服务、构建和 Figma 桌面登记路径。用户只需在目标文件执行 Development → Import plugin from manifest…，选择返回的 manifest，再运行 Figma CLI Bridge。 |
| plugin_not_connected | 先等待自动重连并再 doctor。首次在 Figma 桌面打开或创建单独的 Design 文件，准确命名 CLI Bridge · Sandbox。在 Plugins → Development → Import plugin from manifest… 选择输出的 manifest，运行 Figma CLI Bridge。已导入时只需运行；暂停时恢复连接。需要用户操作时一次给出实际路径和最少步骤。 |
| plugin_reload_required | 先等短暂自动重连再次 doctor。仍显示旧版再请用户关闭并重新运行开发插件，只有 manifest 路径改变才重新导入。 |
| bind_required | 核对唯一会话、目标文件，历史信任为空或 ID 一致时运行 node src/cli.mjs bind <sessionId>，再 doctor；不要猜 sessionId。 |
| target_mismatch、ambiguous_sessions | 核对精确文档 ID，请用户在目标文件保留唯一桥接会话。同名副本仍需明确重新授权。 |
| jobs_pending | running/queued 先查 job 并 wait。unknown 先核对原请求、同一文档、实际执行阶段；用原 ID recover 并 wait。服务拦截新任务时不要换 ID 重做。恢复回执若指向部分画板，回读 frameId，保留人工编辑并报告具体差异。 |
| bundle_missing、bundle_invalid、command_failed、service_start_failed、setup_failed | 分别检查完整 Skill 安装、锁定依赖/网络、明确的本地日志或返回的错误。不要展示凭据、打包 .local、上传含配对码的 dist，或降低文件身份检查。 |

## 已连接但画布是空的

默认按[主题模板](theme.md)准备用户自己的资源。以下流程仅在用户明确选择 Luigi 示例后执行。

先 design.selection、design.read，查看文档页列表与本地变量、文字样式和真实组件。对全新且获准使用默认基础库的专用 Sandbox，可逐页核对为空后执行 demo.ensure 创建独立示例页。读取 result.ids.page 对应的完整 design.read 快照（limit 1000），从 src/button-plan.mjs 导入 seal(snapshot) 计算校验值，执行 button.complete 的 args 为 {"expected":"实际 seal"}。执行 button.verify 检查所有 checks 和 audit.technicalPassed，button.export 打开 PNG 检查。样式、语义变量和通过验收的 Button 现在可用于组稿。已部分初始化、同名资产、缺权、字体缺失、旧工程或用户指定其他风格时，先识别差异；避免在已有文件上运行 demo.ensure 来试错。独立新样式按具体需求建立自己的基础库。
