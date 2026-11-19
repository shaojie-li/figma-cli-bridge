# 基础组件变体、状态与覆盖合同

默认 document 模式复用目标文件自己的主题。下文涉及 Luigi 色板、命名、字体、图标和组件合同的规则适用于显式选用的 Luigi 示例。

版本 1.0.0，2026-11-18。可执行的第一批合同在 `design/components.json`，通过 `node src/cli.mjs component-cases Actions/Button` 生成最小必验矩阵。

## 状态拆分

- Intent/Tone：动作级别或反馈语义，如 Primary、Danger、Warning。
- State：当前交互/执行状态，如 Rest、Hover、Pressed、Disabled、Loading。
- Focus：独立布尔变体轴。Loading、Error 等可以同时拥有键盘焦点，不能让单一 State 列表吞掉焦点。
- Validation：None、Error、Warning、Success，与 Focus 和内容分开。
- Content/Checked：空值/已填、未选/已选/半选等，与禁用独立。
- Size：语义档位 Sm/Md/Lg；Theme 使用项目 Token 主题策略，不能为每个文案和颜色都生成新变体。
- 文案、显示可选图标用 TEXT/BOOLEAN 属性；图标替换用 INSTANCE_SWAP。不是所有差异都要成为 variant。

## 责任矩阵

| 家族 | 必验场景 | 不应硬塞进该基础组件 |
|---|---|---|
| Button | Rest、Hover、Pressed、Focus、Disabled、Loading；Danger 操作；图标/长标签 | Empty、NoResults；异步操作最终成功/失败一般由页面反馈 |
| Input / Textarea | 空/已填、Hover、Focus、Disabled、ReadOnly、Error、Warning、Success；多行消息 | 把空值当错误；把列表加载塞进普通文本框 |
| Checkbox | Unchecked、Checked、Indeterminate；Hover、Pressed、Focus、Disabled、Error；多行标签 | 任务完成删除线、整行卡片底板 |
| Radio / Switch | Checked 独立于交互；Focus、Disabled；Radio 组错误说明 | Radio/Switch 不默认有 Indeterminate；Switch 异步状态仅真实场景需要 |
| Select / Combobox | Closed/Open、Focus、Disabled、Error；Selected；选项 Hover/Selected/Disabled | 数据 Loading、Empty、NoResults 放弹层内容状态，不全部挤成触发器 State |
| Alert / Toast | Info、Success、Warning、Error；可选动作和关闭；长文案 | 无意义 Hover 版 Alert；消息等级不能只靠颜色 |
| Dialog / Popover / Tooltip | 展示、内容长度、关闭、位置、焦点进入/返回和边缘碰撞 | 每个弹层都增加业务 Empty/Error；这些由内容负责 |
| List / Table / ContentState | Loading、Empty、NoResults、Error、Ready；按场景加入 Offline/Forbidden、部分失败 | 空状态不能与加载同时显示，不能删除已有内容掩盖局部失败 |

第一批机器合同覆盖 Button、Input、Checkbox、Alert、ContentState。Textarea 可借用 Input 的状态原则，但没有登记独立合同之前不得宣称已验收。Radio/Switch、Select、Overlay 等先按本表设计，纳入当前产品时补合同和组件，不预建全库。

## 合法组合与覆盖方式

禁止机械生成所有轴的笛卡尔积。每个组件需要：

1. 一个默认组合。
2. 每个必要轴的所有值至少有一个以默认值为基底的样本。
3. 风险交叉组合：Loading + Focus、Error + Focus、Warning + Focus、Checked + Disabled、ReadOnly + Filled 等。
4. 显式非法组合检查，例如 Disabled + Focus（原生不可聚焦禁用策略）。如果产品采用 aria-disabled 且保留焦点，应另建明确平台合同，而不是静默破例。
5. 实际使用的每个未被上述覆盖的组合，在进入页面前补对应样本。最小矩阵是下限，不等于整个状态空间已验证。

`requiredPairs` 合并默认值生成必验组合；`forbidden` 是局部匹配的禁用条件。新增 Intent/Size/状态要同步合同，不只在 Figma 临时改名字。`Focus=True/False` 是变体轴字符串；`ShowLeadingIcon` 是 Figma BOOLEAN 属性，两者不能混淆。

## 视觉和交互验收

- 状态切换不意外改变控件外框、文本基线和图标槽；错误说明允许增加组件外部纵向空间，不把 Error 做成文本覆盖层。
- FocusRing 不被父级裁切，Error/Warning 边框与焦点环可同时识别。
- Loading 保留宽度、可访问名称和原有焦点；禁用再次触发，不隐藏失败，也不无故清空输入。
- Disabled 与选中/内容状态独立；ReadOnly 仍允许读值和按产品约定选择复制。
- Error/Warning 需要可理解的说明和修复路径；Success 只在真实结果成立时显示。
- Empty 引导创建内容，NoResults 提供修改筛选；Error 提供恢复，Forbidden 提供权限解释。内容不应全部叫“暂无数据”。
- 中文最长标签、多行说明、目标宽度、Light/Dark（如项目需要）、无图标/有图标、键盘与读屏分别检查。
- 组件属性必须绑定真实图层，不能只创建定义。切换变体后文字和图标覆盖不丢失；Figma 视觉验收与代码运行时验收分别记录。

## UI Kit 接入

将来源组件的轴和属性映射到本合同，保留有效结构，补缺失状态和说明。不要为了匹配名称删除真实能力，也不要保留大量当前不需要且未验收的组合。Kit 的 Hover 存在不能证明 Loading/Focus/Error 可用。

依据：Figma variants/component properties 的正交属性思想，Carbon 的设计/代码/文档共同完成标准，以及本项目真实失败路径。状态矩阵是项目选择，不宣称所有社区 Kit 都应完全一致。


## Button 当前已实现与验收（2026-11-18）

当前 Sandbox 的 Light / luigi-default 已实现合同中的 13 个组合，保留原主组件、Label 文字和原实例 ID，新增两个必要的 Phosphor 内部图标主资产（Check / CircleNotch），未扩大到其他控件家族。

- 主体尺寸：Sm 36、Md 44、Lg 48 px；样本固定宽 220 px，原实例 360 px；长标签样例宽 326 px，等于 390 px 视口减去左右 32 px。控件高、间距、padding、圆角均绑定变量。
- 正文 Noto Sans SC 16/24；Sm 14/20；说明 14/20；标题 32/44。共 3 个共享文本样式，所有在范围内的文本均绑定样式。
- `Label` 为真实 TEXT 属性，`ShowLeadingIcon` 为真实 BOOLEAN 属性；图标使用可追溯的官方矢量及内部实例，切换 Hover/Rest 保留文字和图标覆盖。
- Loading 不改变外框、标签、可访问名称意图。Loading 用独立 CircleNotch 代替可选 Check；关闭 ShowLeadingIcon 时 Spinner 仍可见。LeadingIcon 在 Loading 中退出 Auto Layout 且透明，Spinner 占相同的 16 px 槽，因此不会多占一个图标间距。
- FocusRing 采用 2 px 描边，外扩 4 px，12 px 圆角；这些是明确的几何关系，1 px Secondary 描边同样不是强凑 4 px。所有相关祖先不裁切焦点环。
- 当前展示为静态设计状态；没有声称已实现 Spinner 动画、鼠标原型事件、键盘/读屏或防重复提交运行逻辑。

验收：真实 Figma 101 项检查、通用规范审计、原始变量到语义别名及组件/实例的传播/还原、重复执行不新增对象、原生 PNG 视觉检查通过。唯一审计 warning 是已登记的旧 Sandbox 文件名例外。Dark、合同以外的组合和其他组件未扩展。完整证据为 `evidence/button/verification.json`，可编辑实例展示画板见同目录 `export.json` 的 frameId。
