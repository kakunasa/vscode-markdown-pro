# Changelog

All notable changes to **MarkdownJet** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.3] - 2026-05-05

### Fixed

- **Critical: clean up `workbench.editorAssociations` on deactivate / uninstall.**
  Previously, uninstalling MarkdownJet left the user's settings pointing
  `*.md` and `*.markdown` to the now-missing `markdownJet.editor` viewType,
  which made `.md` files unopenable. The extension now snapshots the prior
  associations before writing its own, and restores them on `deactivate()`.

### Changed

- All user-facing strings translated to English (commands, prompts,
  configuration descriptions, lint messages, view name).
- GitHub repository renamed to `kakunasa/markdownjet`; URLs in
  `package.json` (`repository`, `homepage`, `bugs`) updated accordingly.

## [0.0.2] - 2026-05-05

### Added

- **First-run prompt** to set MarkdownJet as the default editor for `*.md`
  and `*.markdown`. If the user already has another editor association,
  the prompt explains the conflict and offers three actions:
  *Set as Default*, *Reopen Current File Only*, *Don't Show Again*.
- New command `MarkdownJet: 设为 Markdown 默认编辑器` —
  one-click setup any time after install.
- New command `MarkdownJet: 重新启用「设为默认」首次提示` —
  reverts the "Don't show again" choice if the user changes their mind.

### Fixed

- Users with an existing `workbench.editorAssociations` entry mapping
  `*.md` to a different editor (e.g. `vscode.markdown.preview.editor`)
  no longer have to edit `settings.json` by hand to activate MarkdownJet.

## [0.0.1] - 2026-05-05

### Added

- **Single-tab custom editor** for `.md` / `.markdown` files via `CustomTextEditorProvider`.
- **Three view modes** in the tab title bar:
  - 编辑 / Edit  — CodeMirror 6 only
  - 双栏 / Both  — editor + preview side-by-side, scroll synced
  - 预览 / Preview — rendered HTML only
- **Window-level shared mode**: switching mode on one `.md` propagates to all
  open `.md` files in the same VS Code window.
- **CodeMirror 6 editor** with line numbers, Markdown syntax highlighting,
  multi-cursor, find/replace, bracket matching, and Tab indent.
- **Live preview** powered by `markdown-it`:
  - GitHub-flavored typography (themed via VS Code CSS variables)
  - Syntax-highlighted fenced code blocks via **highlight.js**
    (`github` / `github-dark` themes auto-switching)
  - **Mermaid 10.x** diagrams (flowchart, sequence, class, state, pie, gantt, ER, …)
  - **KaTeX** math (`$inline$` and `$$block$$`)
  - Locally bundled vendor assets — no CDN, fast first paint
- **Outline TreeView** in the Explorer panel; clicking a heading reveals
  the corresponding line in the editor and scrolls the preview.
- **Bidirectional scroll sync** in `both` mode via `data-source-line`
  attributes injected by markdown-it.
- **Basic Markdown lint** (MD001 / MD009 / MD012 / MD018 / MD034) reported
  to the Problems panel.
- **Insert helpers** with keybindings: table (`Cmd+Alt+T`), link (`Cmd+Alt+L`),
  image (`Cmd+Alt+I`), and a simple formatter (`Shift+Alt+F`).
- **VS Code theme integration**: editor + preview + tab-bar buttons all
  use `--vscode-*` CSS variables and respond to live theme changes.
- **12 theme-aware tab-bar icons** (3 modes × active/inactive × light/dark).
- Mode switch keybindings: `Cmd+1` / `Cmd+2` / `Cmd+3`.
