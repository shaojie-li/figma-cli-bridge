# Figma 文件、图层与资产命名

默认 document 模式复用目标文件自己的主题。下文涉及 Luigi 色板、命名、字体、图标和组件合同的规则适用于显式选用的 Luigi 示例。

版本 1.0.0，2026-11-18。优先语义稳定、可检索、与代码对应。不按外观、坐标、当前文案或临时版本命名。

## 固定语法

| 对象 | 规则 | 示例 |
|---|---|---|
| 文件 | 产品 · 用途 · 平台 | Luigi UI · DesignSystem · CrossPlatform |
| 用途 | DesignSystem / Product / Sandbox / UIKitReview | CLI Bridge · Sandbox · CrossPlatform |
| 平台 | Web / iOS / Android / CrossPlatform | 示例产品 · Product · Web |
| 页面 | 两位编号 · 固定职责 | 02 · Components |
| Sandbox 任务页 | 90 · Sandbox · 任务主题 | 90 · Sandbox · 发布确认 |
| 产品画板 | Feature/Viewport/Scenario | Reading/Mobile/Empty |
| 组件集/主组件 | Category/Component，PascalCase | Actions/Button、Forms/Input |
| 变体 | Axis=Value, Axis=Value，按合同轴顺序 | Intent=Primary, Size=Md, State=Hover, Focus=False |
| 组件内容属性 | PascalCase，语义用途 | Label、ShowLeadingIcon、LeadingIcon |
| 组件内部层 | 稳定语义角色，PascalCase | Container、Label、LeadingIcon、Message、FocusRing |
| 页面组件实例 | 业务角色，不重复状态和尺寸 | SubmitAction、EmailField、ArticleList |
| 图标主资产 | Icon/Phosphor/Name/Weight | Icon/Phosphor/Check/Regular |
| 图标内部矢量 | Path1、Path2…（必要分片） | Path1 |
| 变量集合 | 职责 | Color/Normal/Light、Color/Warm/Dark、Layout |
| 变量 | 小写 slash 路径，角色使用 kebab-case | color/primary、color/fg-muted、space/8、radius/control |
| 文本样式 | Role/Variant | Body/Default、Label/Small、Heading/Large |

固定页面：`00 · Overview`、`01 · Foundations`、`02 · Components`、`03 · Patterns`、`04 · Screens`、`90 · Sandbox`、`99 · Archive`。按实际需要创建，不建空页面充数。Starter 页面/库限制仍有效，可以在现有页内用语义 Frame 分组，不为了目录升级套餐。

组件类别按职责：Actions、Forms、Navigation、DataDisplay、Feedback、Overlay；业务组合放 Patterns。模式、尺寸、状态放属性，不把 `BlueButton`、`ButtonHover44` 作为组件家族名。

## 兼容与稳定身份

### Typography 文字样式

Figma 使用共享 Text Style，把字体、字重、字号和行高作为一个角色应用。角色登记在 `design/policy.json` 的默认 profile 中。字号和行高按顺序成对登记，并从 `typeScale` 允许的组合中选取。

| Figma 共享样式 | JSON 路径（相对 `modes.default`） | 字号 / 行高 | 用途 |
|---|---|---|---|
| Heading/Large | `heading.large` | 32 / 44 | 页面标题 |
| Heading/Medium | `heading.medium` | 24 / 32 | 区块标题 |
| Body/Default | `body.default` | 16 / 24 | 正文、默认控件文案 |
| Label/Small | `label.small` | 14 / 20 | 标签、辅助信息、紧凑控件文案 |
| Caption/Default | `caption.default` | 12 / 16 | 注释、时间戳、图表脚注 |

五个角色使用 Noto Sans SC Regular，字重 400。导出保留绝对行高。Web 使用 CSS px，也可用行高除以字号得到无单位行高；React Native 使用数值型 `fontSize` 和 `lineHeight`；iOS 使用 pt，并在段落样式中设置目标行高；Android Compose 的字号和行高使用 sp；Flutter 的 `TextStyle.height` 使用行高与字号的比值，例如正文为 `24 / 16 = 1.5`。各端需加载对应字体，支持系统文字缩放时应一起缩放字号与行高。

### Layout 尺寸

Layout 使用 Default 模式。设计者按用途选择档位，表中数值均为 px。

| 分组 | 档位与数值 | 典型用途 |
|---|---|---|
| `space` | 0、4、8、12、16、20、24、32、40、48、64、80、96、128 | 小档用于组内间隔，中档用于内边距，大档用于页面分区 |
| `control-height` | xs 32、sm 36、md 44、lg 48、xl 56 | xs 用于密集工具栏，md 为默认控件，xl 用于突出的大尺寸操作 |
| `icon-size` | sm 12、md 16、lg 20、xl 24 | 分别用于紧凑标记、行内图标、工具栏图标、独立操作图标 |
| `radius` | none 0、badge 4、control 8、focus-ring 12、card 16、panel 24 | 按方角、徽标、控件、焦点环、卡片和大面板选择 |

控件高度和图标尺寸可独立选择。图标尺寸描述图形本身的宽高，点击区域由承载控件决定。尺寸变量可供新布局使用；Button 已验收的 Size 变体为 Sm、Md、Lg。

### 共享颜色

共享角色登记在 `design/color-roles.json`。每个键描述一种能独立调色的用途。先查已有角色；确需新增时，登记小写 kebab-case 键和中文用途，再创建变量。前景用 `fg`，次要前景用 `fg-muted`，交互状态放在末尾，如 `primary-hover`。公共模板使用 `Color/{Normal,Warm}/{Light,Dark}` 四个独立集合。每个集合含同名的 15 个颜色角色及 `gradient/start`、`gradient/middle`、`gradient/end` 三个 RGBA 色标。变量身份按集合和角色共同定位。JSON 使用 `themes.warm.dark.primary` 或 `themes.warm.dark.gradient.start`，原 `modes.light` 路径兼容 Normal/Light。组件名、平台名和具体色相均不进入共享角色键。

| Figma | JSON Light 键 | Web CSS | Tailwind v4 用法 |
|---|---|---|---|
| `color/primary` | `primary` | `--ui-primary` | `bg-primary` |
| `color/fg-muted` | `fg-muted` | `--ui-fg-muted` | `text-fg-muted` |
| `color/on-solid` | `on-solid` | `--ui-on-solid` | `text-on-solid` |

Web 端可用 `@theme inline { --color-primary: var(--ui-primary); }` 注册对应的 Tailwind 工具类。`on-solid` 同时服务主色和危险实色背景。新增主题沿用相同的角色键；修改已导出键属于接口变更，需要同步迁移消费者。插件重命名、生成、审计和 JSON 导出均校验角色清单。

- 组件内的 Label、LeadingIcon 等角色跨变体保持同名、同层级，减少切换时覆盖丢失。文字变化不自动改变图层名。
- 对象身份始终使用 Figma ID；名称不是唯一身份。普通重复实例允许同名，读写不得用名称猜测唯一对象。同集合变量和同组件集的状态组合必须唯一。
- 属性真实 ID 常带 `#...`，调用 API 时必须保留完整 ID；界面展示基础名称，不擅自裁剪 ID 后写入。
- `/` 用于资产分组；组件集内部的子组件必须保持 `Axis=Value` 语法，不能批量改成普通路径。
- 禁用 `Frame 123`、`Group 7`、`Rectangle`、`Copy`、`final2`、`最终版` 等无语义名称。版本记录放 Git、Figma 版本记录或 Overview，不不断加文件后缀。
- 名称检查无法证明语义选得正确；审查者仍需核对 `Content` 是否过于笼统、`SubmitAction` 是否匹配实际任务。

## 当前试点迁移

`CLI Bridge · Sandbox` 是现有文件身份保护条件，作为唯一显式历史文件名例外（审计 warning）。本轮不自动改文件名、不扩大文件授权。以后新建文件按完整三段式命名，再显式配置精确目标；不能接受任意符合格式的文件进行写入。

旧试点对象只按回读 ID 迁移名称，先输出 dry-run，再执行带 fingerprint 的单对象 patch，不重建节点。历史恢复回执保持原样，不能当作迁移后的最新证据。

新样本生成已改用 `90 · Sandbox`、`BridgeProof/Desktop/Default`、`Actions/Button`、`Title`、`Description`、`Label`、`SubmitAction`、`Caption`。旧四集合文件使用 `design.collections` 预检并迁移。空参数返回 fingerprint；传入当次 `expected` 后执行，迁移会比对所有顶层 Frame 的原生 PNG 和颜色 JSON。

依据：Figma 官方推荐 slash 分组和一致的对应图层名；文件三段式、页面编号与角色词汇是本项目约定，不是 Figma 强制标准。来源见 DESIGN_SYSTEM.md。
