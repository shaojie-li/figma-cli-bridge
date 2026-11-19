# 调用与验收

在 doctor 返回的 bridge 目录运行。请求写入本安装私有 .local/requests，文件包含 id、action、args。为每个新操作生成 UUID；超时恢复使用原 ID。可以用 node src/cli.mjs submit <绝对请求文件> 提交，再用 node src/cli.mjs wait <id> 查询最终 job。较大快照重定向进 .local 并在本机筛选，不把整个快照反复发回模型。

1. design.selection 的 args 为 {}，取得 pageId 和选择。design.read 接受 {"nodeIds":["真实页或对象 ID"],"limit":1000}，返回 nodes、textStyles、variables、collections、fingerprints。限定回读范围；超过上限时按具体对象读取。button.verify 仅针对本项目的默认样本。
从 design.selection 的 pages 列表解析目标。新任务调用 design.page 并传 {"name":"90 · Sandbox · 发布确认"} 创建并切换到任务页。需要切回任务页或用户明确指定已有页时，传 {"pageId":"真实页面 ID"}。同名不代表同一任务；独立任务用能区分用途的名称，同一任务用原 pageId。保存文档 ID、建页请求 ID 和 pageId；中断时查询原请求，若切页失败但已创建则从列表核对并按 ID 进入。后续 compose 使用目标 pageId。读取其他页的主组件用其节点 ID。

2. 生成一个独立画板时准备如下 design.compose 参数。尖括号均须替换为本次真实 ID。默认 dryRun 为 true；成功后换新 ID，将 dryRun 改为 false。画板名称在当前页内需唯一。修改已存在的画板先 read 再 patch，不重复 compose。

```json
{
  "pageId": "<pageId>",
  "profile": "document",
  "width": 480,
  "dryRun": true,
  "root": {
    "kind": "stack", "name": "Release/Confirm", "direction": "VERTICAL",
    "padding": 32, "gap": 16, "background": "<语义背景颜色变量 ID>",
    "children": [
      {"kind":"text","name":"Title","text":"发布这个版本？","styleId":"<标题样式 ID>","color":"<前景变量 ID>"},
      {"kind":"instance","name":"ConfirmAction","mainId":"<Button 具体变体主组件 ID>","properties":{"<实际文本属性键含后缀>":"确认发布"}}
    ]
  }
}
```

stack 支持 VERTICAL 或 HORIZONTAL、等值四边 padding、gap、可选背景；内层可嵌套。text 需要实际共享文本样式及颜色变量。instance 引用 COMPONENT，读取父组件集定义以获取合法属性键和变体值。垂直容器内子项默认水平填充；当前操作不支持任意绝对定位、矢量绘制、创建任意新组件集或删除旧稿。

显式选用 Luigi 示例且表单缺少已验收的输入资产时，`fieldAssets` 可引用现有共享样式和颜色变量（键为 `styleId`、`background`、`foreground`、`placeholder`、`border`、`error`），配合 `{"kind":"field","name":"EmailInput","state":"Invalid","value":"li.example.com"}`。支持 `Default`、`Placeholder`、`Invalid`；只为本稿用到的状态创建本地主组件及实例，文字可用 `Value` 属性修改。标签和提示仍在表单栈中单独排版，不宣称覆盖完整 `Forms/Input` 合同。回读时包含返回的 `fieldAssetsId`。横向 `stack` 可用 `equalColumns: true` 排列子栈，其可选 `radius` 必须符合 profile。

3. 修改已有对象时，design.patch 示例为 {"target":{"kind":"node","id":"<ID>"},"field":"characters","value":"确认发布","expected":"<该节点最新 fingerprint>","dryRun":true}。先看差异再新 ID 应用；冲突时回读，切勿重用过期 expected。
4. 读回结果中的 frameId；design.audit 指定 {"nodeIds":["<frameId>"],"profile":"document"}。显式验收 Luigi 组件合同时另传真实组件集 nodeIds 和 requireComponents，如 ["Actions/Button"]。不要要求在只含实例的画板快照里找到主组件集。检查 technicalPassed、issues 和例外理由。需要时读取独立 Button 验证明细。
5. design.export 用 {"nodeId":"<frameId>"}，从 job.result.pngPath 打开实际 PNG。核对请求文案、状态、对齐、截断、长文案和窄屏表现。返回真实画板 ID 与预览。PNG 仅用于检查，交付物是可编辑的 Figma 图层。交互行为和读屏体验应标明验证环境。
