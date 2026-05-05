# 测试用 Markdown 文件

每个文件覆盖一个独立功能场景,方便逐项验证。

| 文件 | 验证什么 |
| --- | --- |
| `01-basic.md`        | 标题/段落/列表/引用/任务列表/链接/分隔线 |
| `02-tables.md`       | 表格(对齐、emoji、内联代码) |
| `03-code.md`         | 多语言代码块 |
| `04-mermaid.md`      | Mermaid 6 类图(流程/时序/类/状态/饼/甘特) |
| `05-math.md`         | KaTeX 行内 + 块级公式 |
| `06-lint-issues.md`  | 故意触发 5 类 Lint 规则 |
| `07-images.md`       | 远程/相对路径/插入图片命令 |
| `08-large-doc.md`    | 综合长文档(性能 + 大纲) |

## 怎么测

1. 在 Extension Host 里通过左侧资源管理器**双击**任意文件
2. 默认进入「编辑」模式 → 看 textarea 内容
3. 切「双栏」/「预览」模式 → 看渲染效果
4. 修改文字 → 预览应该 200ms 内跟新
5. 切到 `06-lint-issues.md` → `Cmd+Shift+M` 看 Problems 面板
6. 切到 `08-large-doc.md` → 看左侧"Markdown 大纲"是否完整层级

## 已知限制(不是 bug)

- textarea 没有语法高亮 / 行号 / 多光标(后续可能换成 CodeMirror)
- Lint 警告只在 Problems 面板显示,textarea 里看不到下划线
- 拖拽图片到 textarea 不会触发上传(用命令 `Markdown Pro: 上传图片` 替代)
