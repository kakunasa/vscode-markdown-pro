import * as vscode from 'vscode';
import * as path from 'path';
import { renderBody } from '../preview/renderer';

const RENDER_DEBOUNCE_MS = 150;
const APPLY_EDIT_DEBOUNCE_MS = 250;

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'markdownPro.editor';

  public static activeDoc: vscode.TextDocument | undefined;
  public static activeWebview: vscode.WebviewPanel | undefined;
  public static currentMode: 'edit' | 'both' | 'preview' = 'edit';
  private static panels = new Set<vscode.WebviewPanel>();
  /** Lookup "the panel showing this URI" — used by outline reveal so we can
   *  postMessage the right webview when a heading is clicked. */
  public static panelsByUri = new Map<string, vscode.WebviewPanel>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new MarkdownEditorProvider(context);
    const editorReg = vscode.window.registerCustomEditorProvider(
      MarkdownEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false
      }
    );

    const setMode = (mode: 'edit' | 'both' | 'preview') => {
      const panel = MarkdownEditorProvider.activeWebview;
      if (!panel) return;
      panel.webview.postMessage({ type: 'setMode', mode });
    };

    const cmds = vscode.Disposable.from(
      vscode.commands.registerCommand('markdownPro.viewMode.editOnly',           () => setMode('edit')),
      vscode.commands.registerCommand('markdownPro.viewMode.editOnly.active',    () => setMode('edit')),
      vscode.commands.registerCommand('markdownPro.viewMode.both',               () => setMode('both')),
      vscode.commands.registerCommand('markdownPro.viewMode.both.active',        () => setMode('both')),
      vscode.commands.registerCommand('markdownPro.viewMode.previewOnly',        () => setMode('preview')),
      vscode.commands.registerCommand('markdownPro.viewMode.previewOnly.active', () => setMode('preview')),

      // Outline → reveal: jump to a specific line in the file's custom editor.
      vscode.commands.registerCommand(
        'markdownPro.revealLine',
        async (uri: vscode.Uri, line: number) => {
          if (!uri) return;
          // Make sure the file is open in our editor (no-op if already open).
          await vscode.commands.executeCommand(
            'vscode.openWith', uri, MarkdownEditorProvider.viewType
          );
          const panel = MarkdownEditorProvider.panelsByUri.get(uri.toString());
          if (panel) {
            panel.reveal(panel.viewColumn, false);
            panel.webview.postMessage({ type: 'reveal', line });
          }
        }
      )
    );

    return vscode.Disposable.from(editorReg, cmds);
  }

  static publishModeContext(mode: string | undefined) {
    vscode.commands.executeCommand('setContext', 'markdownPro.activeMode', mode ?? 'edit');
  }

  resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void {
    console.log('[markdownPro] resolveCustomTextEditor', document.uri.fsPath);
    MarkdownEditorProvider.activeDoc = document;
    MarkdownEditorProvider.activeWebview = webviewPanel;
    MarkdownEditorProvider.panels.add(webviewPanel);
    MarkdownEditorProvider.panelsByUri.set(document.uri.toString(), webviewPanel);

    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    const distRoot  = vscode.Uri.joinPath(this.context.extensionUri, 'dist');
    // Allow loading any image referenced by a relative path inside the
    // markdown file: include the document's directory + the workspace folder.
    const docDir   = vscode.Uri.file(path.dirname(document.uri.fsPath));
    const wsRoots  = vscode.workspace.workspaceFolders?.map((f) => f.uri) ?? [];
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaRoot, distRoot, docDir, ...wsRoots]
    };
    webviewPanel.webview.html = this.buildHtml(webviewPanel.webview);

    // Build an image-src resolver bound to this document + webview.
    // - http(s)/data/vscode URIs pass through
    // - everything else is treated as a path relative to the doc's directory
    const resolveImage = (src: string): string => {
      if (!src) return src;
      if (/^(https?:|data:|vscode-(webview-)?resource:|file:)/i.test(src)) return src;
      const docDirFs = path.dirname(document.uri.fsPath);
      const absPath = path.isAbsolute(src) ? src : path.resolve(docDirFs, src);
      return webviewPanel.webview.asWebviewUri(vscode.Uri.file(absPath)).toString();
    };
    const renderHtml = (text: string) => renderBody(text, { resolveImage });

    let renderTimer: NodeJS.Timeout | undefined;
    let applyEditTimer: NodeJS.Timeout | undefined;
    let pendingEditText: string | undefined;
    let suppressNextDocChange = false;

    const pushPreview = () => {
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(() => {
        renderTimer = undefined;
        webviewPanel.webview.postMessage({ type: 'preview', html: renderHtml(document.getText()) });
      }, RENDER_DEBOUNCE_MS);
    };

    const flushPendingEdit = async () => {
      if (pendingEditText === undefined) return;
      const text = pendingEditText;
      pendingEditText = undefined;
      if (text === document.getText()) return;
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
      );
      edit.replace(document.uri, fullRange, text);
      suppressNextDocChange = true;
      await vscode.workspace.applyEdit(edit);
    };

    const subs: vscode.Disposable[] = [];

    subs.push(
      webviewPanel.webview.onDidReceiveMessage(async (msg) => {
        if (!msg) return;
        switch (msg.type) {
          case 'ready':
            webviewPanel.webview.postMessage({
              type: 'load',
              text: document.getText(),
              mode: MarkdownEditorProvider.currentMode
            });
            pushPreview();
            if (webviewPanel.active) {
              MarkdownEditorProvider.publishModeContext(MarkdownEditorProvider.currentMode);
            }
            break;

          case 'edit':
            pendingEditText = msg.text;
            if (applyEditTimer) clearTimeout(applyEditTimer);
            applyEditTimer = setTimeout(() => {
              applyEditTimer = undefined;
              flushPendingEdit().catch(() => {});
            }, APPLY_EDIT_DEBOUNCE_MS);
            if (renderTimer) clearTimeout(renderTimer);
            renderTimer = setTimeout(() => {
              renderTimer = undefined;
              webviewPanel.webview.postMessage({ type: 'preview', html: renderHtml(msg.text) });
            }, RENDER_DEBOUNCE_MS);
            break;

          case 'save':
            await flushPendingEdit();
            await document.save();
            break;

          case 'modeChanged':
            MarkdownEditorProvider.currentMode = msg.mode;
            if (webviewPanel.active) {
              MarkdownEditorProvider.publishModeContext(msg.mode);
            }
            for (const other of MarkdownEditorProvider.panels) {
              if (other !== webviewPanel) {
                other.webview.postMessage({ type: 'setMode', mode: msg.mode, silent: true });
              }
            }
            break;
        }
      }),

      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== document.uri.toString()) return;
        if (suppressNextDocChange) {
          suppressNextDocChange = false;
          return;
        }
        webviewPanel.webview.postMessage({ type: 'load', text: document.getText() });
        pushPreview();
      }),

      webviewPanel.onDidChangeViewState(() => {
        if (webviewPanel.active) {
          MarkdownEditorProvider.activeDoc = document;
          MarkdownEditorProvider.activeWebview = webviewPanel;
          MarkdownEditorProvider.publishModeContext(MarkdownEditorProvider.currentMode);
        }
      }),

      webviewPanel.onDidDispose(() => {
        flushPendingEdit().catch(() => {});
        if (renderTimer) clearTimeout(renderTimer);
        if (applyEditTimer) clearTimeout(applyEditTimer);
        MarkdownEditorProvider.panels.delete(webviewPanel);
        if (MarkdownEditorProvider.panelsByUri.get(document.uri.toString()) === webviewPanel) {
          MarkdownEditorProvider.panelsByUri.delete(document.uri.toString());
        }
        if (MarkdownEditorProvider.activeDoc === document) {
          MarkdownEditorProvider.activeDoc = undefined;
        }
        if (MarkdownEditorProvider.activeWebview === webviewPanel) {
          MarkdownEditorProvider.activeWebview = undefined;
        }
        subs.forEach((d) => d.dispose());
      })
    );
  }

  private buildHtml(webview: vscode.Webview): string {
    const vendor = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vendor');
    const mermaidUri    = webview.asWebviewUri(vscode.Uri.joinPath(vendor, 'mermaid.min.js'));
    const katexJs       = webview.asWebviewUri(vscode.Uri.joinPath(vendor, 'katex.min.js'));
    const katexAuto     = webview.asWebviewUri(vscode.Uri.joinPath(vendor, 'katex-auto-render.min.js'));
    const katexCss      = webview.asWebviewUri(vscode.Uri.joinPath(vendor, 'katex.min.css'));
    const highlightCss  = webview.asWebviewUri(vscode.Uri.joinPath(vendor, 'highlight.css'));
    const editorJs      = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );
    const cspSource = webview.cspSource;

    return /* html */ `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 img-src ${cspSource} https: data:;
                 script-src ${cspSource};
                 style-src ${cspSource} 'unsafe-inline';
                 font-src ${cspSource} data:;">
  <link rel="stylesheet" href="${katexCss}">
  <link rel="stylesheet" href="${highlightCss}">
  <style>${baseStyles()}</style>
</head>
<body class="mode-edit">
  <div class="container">
    <div class="editor-pane"><div id="editor-host"></div></div>
    <div class="preview-pane"><article id="preview" class="markdown-body"></article></div>
  </div>
  <script src="${mermaidUri}"></script>
  <script src="${katexJs}"></script>
  <script src="${katexAuto}"></script>
  <script src="${editorJs}"></script>
</body>
</html>`;
  }
}

function baseStyles(): string {
  return `
    /* ==========================================================
       Layout — full viewport, theme-driven
       ========================================================== */
    html, body {
      height: 100%; margin: 0; padding: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      overflow: hidden;
    }
    body { display: flex; flex-direction: column; }
    .container { flex: 1; display: flex; min-height: 0; }
    .editor-pane, .preview-pane { display: none; min-width: 0; min-height: 0; }

    body.mode-edit    .editor-pane  { display: flex; flex: 1 1 100%; }
    body.mode-preview .preview-pane { display: block; flex: 1 1 100%; }
    body.mode-both    .editor-pane  { display: flex; flex: 1 1 50%; }
    body.mode-both    .preview-pane {
      display: block; flex: 1 1 50%;
      border-left: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444));
    }

    .editor-pane { flex-direction: column; }
    #editor-host { flex: 1; overflow: hidden; }
    .cm-editor { height: 100%; }
    .cm-editor.cm-focused { outline: none; }

    /* ==========================================================
       Preview — GitHub-flavored, uses VS Code theme tokens
       ========================================================== */
    .preview-pane {
      overflow: auto;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
    }
    #preview {
      max-width: 920px;
      margin: 0 auto;
      padding: 32px 48px 64px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      font-size: 15px;
      line-height: 1.7;
      word-wrap: break-word;
    }

    #preview h1, #preview h2, #preview h3, #preview h4, #preview h5, #preview h6 {
      margin: 1.6em 0 0.6em;
      font-weight: 600;
      line-height: 1.3;
      color: var(--vscode-foreground);
    }
    #preview h1 { font-size: 2em;    border-bottom: 1px solid var(--vscode-panel-border, #ddd); padding-bottom: 0.3em; }
    #preview h2 { font-size: 1.5em;  border-bottom: 1px solid var(--vscode-panel-border, #ddd); padding-bottom: 0.3em; }
    #preview h3 { font-size: 1.25em; }
    #preview h4 { font-size: 1em; }
    #preview h5 { font-size: 0.875em; }
    #preview h6 { font-size: 0.85em; color: var(--vscode-descriptionForeground); }
    #preview > *:first-child { margin-top: 0; }

    #preview p, #preview ul, #preview ol, #preview blockquote, #preview pre, #preview table { margin: 0 0 1em; }
    #preview ul, #preview ol { padding-left: 2em; }
    #preview li + li { margin-top: 0.25em; }
    #preview li > p { margin: 0.4em 0; }

    #preview a { color: var(--vscode-textLink-foreground); text-decoration: none; }
    #preview a:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }

    #preview blockquote {
      padding: 0 1em;
      color: var(--vscode-descriptionForeground);
      border-left: 4px solid var(--vscode-textBlockQuote-border, var(--vscode-panel-border, #ccc));
      background: var(--vscode-textBlockQuote-background, transparent);
    }

    /* Inline code */
    #preview code {
      padding: 0.18em 0.45em;
      margin: 0;
      font-size: 0.88em;
      font-family: var(--vscode-editor-font-family, "SF Mono", Menlo, Consolas, monospace);
      background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.15));
      border-radius: 4px;
    }
    /* Code blocks */
    #preview pre {
      padding: 14px 18px;
      overflow: auto;
      background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.08));
      border: 1px solid var(--vscode-panel-border, transparent);
      border-radius: 6px;
      font-size: 0.88em;
      line-height: 1.55;
    }
    #preview pre code {
      padding: 0; background: transparent; border-radius: 0;
      font-size: inherit; white-space: pre;
    }

    /* Tables */
    #preview table {
      border-collapse: collapse;
      display: block;
      overflow: auto;
      max-width: 100%;
    }
    #preview th, #preview td {
      padding: 8px 14px;
      border: 1px solid var(--vscode-panel-border, #d0d7de);
    }
    #preview th {
      font-weight: 600;
      background: var(--vscode-editorWidget-background, rgba(127,127,127,0.08));
    }
    #preview tr:nth-child(2n) td {
      background: var(--vscode-list-hoverBackground, rgba(127,127,127,0.04));
    }

    /* Horizontal rule */
    #preview hr {
      border: 0;
      border-top: 2px solid var(--vscode-panel-border, #ddd);
      margin: 2em 0;
    }

    /* Images */
    #preview img { max-width: 100%; border-radius: 4px; }

    /* Task lists */
    #preview ul.contains-task-list { list-style: none; padding-left: 1.4em; }
    #preview .task-list-item input { margin-right: 0.5em; }

    /* Mermaid */
    #preview .mermaid { text-align: center; margin: 1.4em 0; }
    #preview .mermaid svg { max-width: 100%; }

    /* KaTeX block spacing */
    #preview .katex-display { margin: 1.2em 0; overflow-x: auto; overflow-y: hidden; }

    /* Scrollbars match VS Code */
    .preview-pane::-webkit-scrollbar { width: 12px; height: 12px; }
    .preview-pane::-webkit-scrollbar-track { background: transparent; }
    .preview-pane::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background, rgba(127,127,127,0.4));
      border-radius: 6px;
    }
    .preview-pane::-webkit-scrollbar-thumb:hover {
      background: var(--vscode-scrollbarSlider-hoverBackground, rgba(127,127,127,0.6));
    }
  `;
}
