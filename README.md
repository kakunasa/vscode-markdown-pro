# MarkdownJet

> JetBrains-style single-tab Markdown editor for VS Code — CodeMirror 6 + Mermaid + KaTeX + GitHub-flavored preview, with bidirectional scroll sync.

![mode buttons in tab bar](docs/screenshots/buttons.png)

## ✨ Features

| Module | What it does |
| --- | --- |
| **In-tab three-mode switcher** | Three icons in the tab title bar — `Edit` / `Both` / `Preview`. The file always lives in **a single tab**; switching modes only re-arranges the panes inside the webview. |
| **Window-level shared mode** | Switch the mode on one `.md` file and every open `.md` in the same VS Code window follows. New windows start in `Edit` mode. |
| **CodeMirror 6 editor** | Line numbers, Markdown syntax highlighting, find/replace (`Cmd+F`), multi-cursor (`Alt+Click`), bracket matching, Tab indent, full undo/redo. |
| **GitHub-flavored preview** | `markdown-it` rendering; fenced code blocks highlighted by **highlight.js** (`github` / `github-dark` themes auto-switching). |
| **Mermaid diagrams** | Flowchart, sequence, class, state, pie, gantt, ER, …14+ types. Bundled locally — no CDN, fast first paint. |
| **KaTeX math** | Inline `$...$` and block `$$...$$`. Local fonts, no CDN. |
| **Outline → reveal** | "Markdown Outline" tree view in the Explorer. Click a heading: editor caret jumps to the line, preview scrolls to the rendered position. |
| **Bidirectional scroll sync** | In `Both` mode, scrolling either pane scrolls the other in lockstep. |
| **Native theme integration** | Editor / preview / tab-bar buttons all use VS Code CSS variables and respond to live theme changes. |
| **Image rendering** | Remote URLs and workspace-relative paths (auto-resolved via `webview.asWebviewUri`). |
| **Built-in lint** | MD001 / MD009 / MD012 / MD018 / MD034 → reported in the Problems panel. |
| **Keybindings** | `Cmd+1/2/3` to switch modes; `Cmd+Alt+T/L/I` to insert table/link/image; `Shift+Alt+F` to format. |

## 🚀 Quick start

### As a user

Install **MarkdownJet** from the Marketplace.

The first time the extension activates, it offers to set itself as the
default `*.md` editor. Click **Set as Default** and you're done — every
markdown file opens in MarkdownJet from then on.

If you ever want to use VS Code's native text editor for a specific file:
right-click the tab → **Reopen Editor With** → **Text Editor**.

### As a contributor

```bash
git clone https://github.com/kakunasa/markdownjet.git
cd markdownjet
npm install
npm run compile        # one-shot build
# or
npm run watch          # incremental rebuild on file changes

# Open the folder in VS Code, then F5 to launch the Extension Development Host.
# In the new window: File → Open Folder → select test-fixtures
# Double-click any .md file to try it out.
```

To produce a publishable `.vsix`:

```bash
npx vsce package
```

## 🎮 Usage

### Three-mode buttons

Open any `.md` file. The **right side of the tab title bar** shows three
monochrome icons that adapt to your VS Code theme:

| Icon | Mode | Layout |
| --- | --- | --- |
| Window + `<>` | **Edit** | CodeMirror full-width |
| Window + top bar + `<>` | **Both** | CodeMirror left, preview right, scroll-synced |
| Window + top bar (filled) | **Preview** | Rendered HTML full-width |

The active mode's icon is **filled solid**; inactive icons are outline-only.
No background chips, no thickness contrast — just shape.

### Outline

The Explorer side bar shows a **Markdown Outline** view. Click any heading:
- Caret moves to that line in the editor
- Preview scrolls to the corresponding rendered element

### Keybindings

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Edit mode | `Cmd+1` | `Ctrl+1` |
| Both mode | `Cmd+2` | `Ctrl+2` |
| Preview mode | `Cmd+3` | `Ctrl+3` |
| Save | `Cmd+S` | `Ctrl+S` |
| Find | `Cmd+F` | `Ctrl+F` |
| Multi-cursor add | `Alt+Click` | `Alt+Click` |
| Insert table | `Cmd+Alt+T` | `Ctrl+Alt+T` |
| Insert link | `Cmd+Alt+L` | `Ctrl+Alt+L` |
| Insert image | `Cmd+Alt+I` | `Ctrl+Alt+I` |
| Format document | `Shift+Alt+F` | `Shift+Alt+F` |

## 🧱 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  VS Code Extension Host                                      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  CustomTextEditorProvider (markdownJet.editor)         │ │
│  │  - 1 webview per file = 1 tab, bound to TextDocument   │ │
│  │  - postMessage in both directions                       │ │
│  │  - Debounced 250 ms write-back to TextDocument          │ │
│  │    (keeps undo history clean)                           │ │
│  └────────────────────────────────────────────────────────┘ │
│        │ postMessage                                         │
│        ▼                                                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Webview  (dist/webview.js, IIFE bundle)                │ │
│  │  ┌──────────────────────┬──────────────────────────────┐│ │
│  │  │  CodeMirror 6        │  <article id="preview">      ││ │
│  │  │  - markdown lang     │  - markdown-it → HTML        ││ │
│  │  │  - line numbers      │  - Mermaid (local bundle)    ││ │
│  │  │  - find / multi-cur  │  - KaTeX  (local bundle)     ││ │
│  │  │  - scroll listener   │  - highlight.js github theme ││ │
│  │  └──────────────────────┴──────────────────────────────┘│ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Independent modules:                                        │
│  - OutlineProvider  → tree view of headings                  │
│  - MarkdownLinter   → diagnostics, 5 rules                   │
│  - editCommands     → table/link/image inserters             │
└─────────────────────────────────────────────────────────────┘
```

### Source layout

```
src/
├── extension.ts                 # entry point — registers customEditor + commands
├── editor/
│   └── markdownEditor.ts        # CustomTextEditorProvider implementation
├── webview/
│   └── editor.ts                # webview side — CodeMirror, scroll sync, render dispatch
├── preview/
│   └── renderer.ts              # markdown-it + highlight.js + source-line injection
├── outline/
│   └── outlineProvider.ts       # TreeDataProvider for the outline view
├── lint/
│   └── linter.ts                # MarkdownLinter (5 rules)
└── edit/
    └── editCommands.ts          # insert table / link / image / format

media/
├── *-{active,inactive}-{light,dark}.svg   # 12 tab-bar mode-button icons
├── icon.{svg,png}               # 128x128 Marketplace icon
└── vendor/                       # generated at build time, not committed
    ├── mermaid.min.js           # Mermaid 10.x (offline)
    ├── katex.min.{js,css} + fonts/
    ├── katex-auto-render.min.js
    └── highlight.css            # github + github-dark, scoped by body class

dist/
├── extension.js                 # esbuild output (Node, CJS)
└── webview.js                   # esbuild output (browser, IIFE)
```

### Dual-bundle build

`esbuild.js` declares **two entry points**:

- `src/extension.ts` → `dist/extension.js` (`platform: node`, `format: cjs`)
- `src/webview/editor.ts` → `dist/webview.js` (`platform: browser`, `format: iife`)

The webview bundle includes CodeMirror 6 and the boot logic (~1.3 MB unminified).
Mermaid and KaTeX are *not* webpacked — they're copied from `node_modules/`
to `media/vendor/` at build time and loaded by the webview via
`<script src="${webview.asWebviewUri(…)}">`.

### Scroll sync algorithm

1. During render, a `markdown-it` core ruler tags every block-level token
   with `data-source-line="<n>"`.
2. The webview listens to `scroll` events on both `view.scrollDOM`
   (CodeMirror) and `.preview-pane`.
3. Editor → preview: take the source line at the editor's top, find the
   bracketing `[data-source-line]` elements in the preview, linearly
   interpolate the target `scrollTop`.
4. Preview → editor: take the source line of the topmost visible preview
   element, dispatch `EditorView.scrollIntoView`.
5. A `suppressScrollSync` flag plus a double-`requestAnimationFrame`
   release prevents the two listeners from echoing each other.

## ⚙️ Configuration

`Cmd+,` then search for `markdownJet`:

| Setting | Default | Description |
| --- | --- | --- |
| `markdownJet.preview.theme` | `light` | Preview theme (legacy — VS Code theme is now the source of truth). |
| `markdownJet.preview.enableMermaid` | `true` | Render fenced ` ```mermaid ` blocks as diagrams. |
| `markdownJet.preview.enableMath` | `true` | Render `$...$` / `$$...$$` with KaTeX. |
| `markdownJet.lint.enable` | `true` | Run live lint and report to Problems. |

## 🐞 Known limitations

- **Lint diagnostics** are reported in the Problems panel; they do **not**
  show as squiggles inside the CodeMirror editor yet
  (`@codemirror/lint` integration is on the TODO list).
- **Drag-and-drop image upload** is not implemented; use the command
  `MarkdownJet: Insert Image` (`Cmd+Alt+I`) to insert a path or URL.
- Already-rendered Mermaid diagrams **keep their old theme** after a
  VS Code theme switch until you trigger a content change to re-render.
- To use VS Code's native text editor for a specific markdown file:
  right-click the file → **Reopen Editor With** → **Text Editor**, or
  run `MarkdownJet: Open in Plain Text Editor`.

## 📦 Bundle size

| File | Unminified |
| --- | --- |
| `dist/extension.js` | ~660 KB (markdown-it + highlight.js inlined) |
| `dist/webview.js` | ~1.3 MB (CodeMirror 6 full set) |
| `media/vendor/mermaid.min.js` | ~3.3 MB |
| `media/vendor/katex/*` | ~600 KB |

The published `.vsix` is ~2.2 MB (production minify enabled by `npm run package`).

## 📝 License

MIT
