# Markdown Pro

> 单 tab、多模式的 VS Code Markdown 编辑器,内嵌 CodeMirror + Mermaid + KaTeX + 语法高亮 + 实时预览。

![mode buttons in tab bar](docs/screenshots/buttons.png)

## ✨ 特性

| 模块 | 说明 |
| --- | --- |
| **三模式 tab 内切换** | 编辑器右上角 3 个按钮:`编辑` / `双栏` / `预览`,**始终单 tab**,模式只改 webview 内部布局 |
| **窗口级模式共享** | 在一个 md 上切换模式,同窗口其它 md 自动同步;新窗口默认编辑模式 |
| **CodeMirror 6 编辑器** | 行号、Markdown 语法高亮、查找替换 (`Cmd+F`)、多光标 (`Alt+Click`)、Tab 缩进、Cmd+Z/Y |
| **GitHub 风格预览** | markdown-it 渲染,代码块走 highlight.js (github / github-dark) |
| **Mermaid 图表** | 流程/时序/类/状态/饼/甘特图等 14+ 类型,本地打包不走 CDN |
| **KaTeX 数学公式** | 行内 `$...$` + 块级 `$$...$$`,本地字体 |
| **大纲 → 跳转** | 资源管理器侧边栏「Markdown 大纲」TreeView,点击跳到对应行,编辑+预览同步定位 |
| **双栏滚动联动** | 双栏模式下,编辑滚动 ↔ 预览滚动 实时同步 |
| **主题跟随 VS Code** | 编辑/预览/按钮全部 `--vscode-*` 变量 + `body.vscode-light/dark` 选择器 |
| **图片支持** | 远程 URL、相对路径(自动用 `webview.asWebviewUri` 解析) |
| **基础 Lint** | MD009/MD012/MD018/MD001/MD034 等规则,诊断进 Problems 面板 |
| **快捷键** | `Cmd+1/2/3` 切模式;`Cmd+Alt+T/L/I` 插入表格/链接/图片;`Shift+Alt+F` 格式化 |

## 🚀 快速开始

### 用户端

直接安装(打包好后)`.vsix` 即可。.md 文件会**默认**用 Markdown Pro 打开。

如果某个文件想用原生编辑器:右键 → **Reopen Editor With** → **Text Editor**。

### 开发端

```bash
git clone https://github.com/kakunasa/vscode-markdown-pro.git
cd vscode-markdown-pro
npm install
npm run compile           # 一次性构建
# 或
npm run watch             # 后台增量构建,改代码自动重打包

# 在 VS Code 里打开本目录,F5 启动 Extension Development Host
# 在弹出的新窗口里 File → Open Folder → 选 test-fixtures
# 双击任意 .md 文件
```

打包成可发布的 `.vsix`:

```bash
npx vsce package
```

## 🎮 使用

### 三模式按钮

打开任意 `.md` 文件,**编辑器 tab 栏右侧**有 3 个图标按钮(随主题变深/浅):

| 图标 | 模式 | 内容 |
| --- | --- | --- |
| 窗口 + `<>` | 编辑 | 仅 CodeMirror 编辑区,占满 tab |
| 窗口 + 顶线 + `<>` | 双栏 | 左编辑 + 右预览,各占一半,**滚动同步** |
| 窗口 + 顶线(下方填实) | 预览 | 仅渲染后的 HTML 预览,占满 tab |

active 模式的按钮会**填实**,inactive 仅外框,不靠粗细/颜色对比。

### 大纲

左侧资源管理器底部出现 **「Markdown 大纲」** 面板。点任一标题:
- 编辑器光标跳到该行
- 预览滚动到对应渲染位置

### 快捷键

| 操作 | macOS | Windows / Linux |
| --- | --- | --- |
| 编辑模式 | `Cmd+1` | `Ctrl+1` |
| 双栏模式 | `Cmd+2` | `Ctrl+2` |
| 预览模式 | `Cmd+3` | `Ctrl+3` |
| 保存 | `Cmd+S` | `Ctrl+S` |
| 查找 | `Cmd+F` | `Ctrl+F` |
| 多光标点击 | `Alt+Click` | `Alt+Click` |
| 插入表格 | `Cmd+Alt+T` | `Ctrl+Alt+T` |
| 插入链接 | `Cmd+Alt+L` | `Ctrl+Alt+L` |
| 插入图片 | `Cmd+Alt+I` | `Ctrl+Alt+I` |
| 格式化 | `Shift+Alt+F` | `Shift+Alt+F` |

## 🧱 架构

```
┌─────────────────────────────────────────────────────────────┐
│  VS Code Extension Host                                      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  CustomTextEditorProvider (markdownPro.editor)          │ │
│  │  - 1 webview / 1 tab,绑定 TextDocument                  │ │
│  │  - postMessage 双向通信                                 │ │
│  │  - 防抖 250ms 写回 TextDocument(保 undo 历史)         │ │
│  └────────────────────────────────────────────────────────┘ │
│        │ postMessage                                         │
│        ▼                                                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Webview (dist/webview.js,iife bundle)                  │ │
│  │  ┌──────────────────────┬──────────────────────────────┐│ │
│  │  │  CodeMirror 6        │  <article id="preview">      ││ │
│  │  │  - markdown lang     │  - markdown-it 渲染 HTML     ││ │
│  │  │  - 行号 / 语法高亮   │  - Mermaid (本地 mermaid.min)││ │
│  │  │  - 查找 / 多光标     │  - KaTeX (本地)               ││ │
│  │  │  - 滚动监听          │  - highlight.js github 主题  ││ │
│  │  └──────────────────────┴──────────────────────────────┘│ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  独立模块:                                                   │
│  - OutlineProvider:解析标题层级 → TreeView                  │
│  - MarkdownLinter:DiagnosticCollection,5 类规则             │
│  - editCommands:插入表格/链接/图片(走 replaceSelection)   │
└─────────────────────────────────────────────────────────────┘
```

### 主要文件

```
src/
├── extension.ts                 # 入口,注册 customEditor + 各命令
├── editor/
│   └── markdownEditor.ts        # CustomTextEditorProvider 实现
├── webview/
│   └── editor.ts                # Webview 端:CodeMirror + 滚动联动 + Mermaid/KaTeX 调度
├── preview/
│   └── renderer.ts              # markdown-it + highlight.js + 数据源行注入
├── outline/
│   └── outlineProvider.ts       # TreeDataProvider,TreeView 大纲
├── lint/
│   └── linter.ts                # MarkdownLinter,5 类规则
└── edit/
    └── editCommands.ts          # 插入表格/链接/图片/格式化

media/
├── *-{active,inactive}-{light,dark}.svg  # 12 个 tab-bar 模式按钮
└── vendor/
    ├── mermaid.min.js           # 离线 Mermaid 10.x
    ├── katex.min.{js,css} + fonts/
    ├── katex-auto-render.min.js
    └── highlight.css            # github + github-dark 合并 + 主题作用域

dist/
├── extension.js                 # esbuild 打包的扩展端 (Node)
└── webview.js                   # esbuild 打包的 webview 端 (browser/iife)
```

### 双 Bundle 设计

`esbuild.js` 配置了**两个 entryPoint**:

- `src/extension.ts` → `dist/extension.js`(`platform: node`,`format: cjs`)
- `src/webview/editor.ts` → `dist/webview.js`(`platform: browser`,`format: iife`)

webview 包含 CodeMirror + 启动逻辑 ≈ 1.3 MB(unminified)。Mermaid/KaTeX 不走 webpack/bundle,而是 esbuild 启动时**复制**到 `media/vendor/`,webview 直接 `<script src="${webview.asWebviewUri(...)}">` 引用。

### 滚动联动算法

1. 渲染时,markdown-it core ruler 给每个块级 token 加 `data-source-line` 属性
2. webview JS 监听 `view.scrollDOM` 和 `.preview-pane` 的 scroll 事件
3. 编辑器滚 → 取顶部行号 → 在预览里找前后两个 `[data-source-line]` 元素 → 线性插值算预览滚动目标
4. 预览滚 → 取顶部第一个 `[data-source-line]` 元素的行号 → CodeMirror `scrollIntoView`
5. `suppressScrollSync` flag + 双 RAF 释放,避免回环

## ⚙️ 配置

`Cmd+,` 搜 `markdownPro`:

| 配置项 | 默认 | 说明 |
| --- | --- | --- |
| `markdownPro.preview.theme` | `light` | 预览主题:`light` / `dark` / `github` / `solarized`(已基本被 VS Code 主题接管,保留兼容) |
| `markdownPro.preview.enableMermaid` | `true` | 是否启用 Mermaid 图表 |
| `markdownPro.preview.enableMath` | `true` | 是否启用 KaTeX |
| `markdownPro.lint.enable` | `true` | 是否启用 Lint 实时校验 |

## 🐞 已知限制

- **Lint 警告**只显示在 Problems 面板,不在 CodeMirror 编辑区显示下划线(`@codemirror/lint` 集成是后续 TODO)
- **预览**目前不支持图片拖拽(命令 `Markdown Pro: 插入图片` 选「URL」/「本地文件」替代)
- 切回 VS Code 原生编辑器:右键 .md 文件 → **Reopen Editor With** → **Text Editor** 或者命令面板搜 `Markdown Pro: 用纯文本编辑器打开`
- 已渲染的 Mermaid 图在主题切换后**保留旧色**,需要触发一次内容更新才会重渲染

## 📦 依赖体积

| | unminified |
| --- | --- |
| `dist/extension.js` | ~660 KB(含 markdown-it + highlight.js) |
| `dist/webview.js` | ~1.3 MB(CodeMirror 全套) |
| `media/vendor/mermaid.min.js` | ~3.3 MB |
| `media/vendor/katex/*` | ~600 KB |

最终 `.vsix` ≈ 5 MB。生产构建 `npm run package` 会 minify。

## 📝 License

MIT
