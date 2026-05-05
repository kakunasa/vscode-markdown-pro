import * as vscode from 'vscode';

export class MarkdownLinter implements vscode.Disposable {
  private collection = vscode.languages.createDiagnosticCollection('markdownPro');
  private subs: vscode.Disposable[] = [];

  constructor() {
    this.subs.push(
      vscode.workspace.onDidOpenTextDocument((d) => this.lintIfEnabled(d)),
      vscode.workspace.onDidChangeTextDocument((e) => this.lintIfEnabled(e.document)),
      vscode.workspace.onDidCloseTextDocument((d) => this.collection.delete(d.uri)),
      vscode.commands.registerCommand('markdownPro.lint.run', () => {
        const doc = vscode.window.activeTextEditor?.document;
        if (doc) this.lint(doc);
      })
    );
    if (vscode.window.activeTextEditor) {
      this.lintIfEnabled(vscode.window.activeTextEditor.document);
    }
  }

  private lintIfEnabled(doc: vscode.TextDocument) {
    if (doc.languageId !== 'markdown') return;
    const enabled = vscode.workspace
      .getConfiguration('markdownPro.lint')
      .get<boolean>('enable', true);
    if (!enabled) {
      this.collection.delete(doc.uri);
      return;
    }
    this.lint(doc);
  }

  private lint(doc: vscode.TextDocument) {
    const diags: vscode.Diagnostic[] = [];
    const lines = doc.getText().split('\n');
    let prevHeadingLevel = 0;
    let blankRun = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 1. 行尾空格(>2 个或非两个空格的)
      const trailing = line.match(/[ \t]+$/);
      if (trailing && trailing[0] !== '  ') {
        const start = line.length - trailing[0].length;
        diags.push(diag(i, start, line.length, 'MD009 行尾多余空格', vscode.DiagnosticSeverity.Information));
      }

      // 2. 标题层级跳跃
      const h = line.match(/^(#{1,6})\s+\S/);
      if (h) {
        const level = h[1].length;
        if (prevHeadingLevel > 0 && level > prevHeadingLevel + 1) {
          diags.push(
            diag(i, 0, h[1].length, `MD001 标题层级跳跃: H${prevHeadingLevel} → H${level}`,
                 vscode.DiagnosticSeverity.Warning)
          );
        }
        prevHeadingLevel = level;
      }

      // 3. 标题井号后缺少空格
      const noSpace = line.match(/^(#{1,6})[^\s#]/);
      if (noSpace) {
        diags.push(diag(i, 0, line.length, 'MD018 标题 # 后缺少空格', vscode.DiagnosticSeverity.Warning));
      }

      // 4. 连续空行
      if (line.trim() === '') {
        blankRun++;
        if (blankRun > 1) {
          diags.push(diag(i, 0, 0, 'MD012 多个连续空行', vscode.DiagnosticSeverity.Information));
        }
      } else {
        blankRun = 0;
      }

      // 5. 裸 URL(应使用 <url> 或 [text](url))
      const bareUrl = line.match(/(?<!\(|<|\])(https?:\/\/\S+)/);
      if (bareUrl && !line.includes('](')) {
        const start = line.indexOf(bareUrl[1]);
        diags.push(
          diag(i, start, start + bareUrl[1].length,
               'MD034 裸 URL,建议使用 [text](url) 或 <url>',
               vscode.DiagnosticSeverity.Hint)
        );
      }
    }

    this.collection.set(doc.uri, diags);
  }

  dispose() {
    this.collection.dispose();
    this.subs.forEach((d) => d.dispose());
  }
}

function diag(
  line: number,
  startCol: number,
  endCol: number,
  message: string,
  severity: vscode.DiagnosticSeverity
): vscode.Diagnostic {
  const range = new vscode.Range(line, startCol, line, endCol);
  const d = new vscode.Diagnostic(range, message, severity);
  d.source = 'markdownPro';
  return d;
}
