import * as vscode from 'vscode';

export class MarkdownLinter implements vscode.Disposable {
  private collection = vscode.languages.createDiagnosticCollection('markdownJet');
  private subs: vscode.Disposable[] = [];

  constructor() {
    this.subs.push(
      vscode.workspace.onDidOpenTextDocument((d) => this.lintIfEnabled(d)),
      vscode.workspace.onDidChangeTextDocument((e) => this.lintIfEnabled(e.document)),
      vscode.workspace.onDidCloseTextDocument((d) => this.collection.delete(d.uri)),
      vscode.commands.registerCommand('markdownJet.lint.run', () => {
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
      .getConfiguration('markdownJet.lint')
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

      // 1. Trailing whitespace (any non-zero length other than the 2-space "hard break")
      const trailing = line.match(/[ \t]+$/);
      if (trailing && trailing[0] !== '  ') {
        const start = line.length - trailing[0].length;
        diags.push(diag(i, start, line.length, 'MD009 trailing whitespace', vscode.DiagnosticSeverity.Information));
      }

      // 2. Heading level jumps (e.g., H2 → H4 with no H3)
      const h = line.match(/^(#{1,6})\s+\S/);
      if (h) {
        const level = h[1].length;
        if (prevHeadingLevel > 0 && level > prevHeadingLevel + 1) {
          diags.push(
            diag(i, 0, h[1].length, `MD001 heading level jumps: H${prevHeadingLevel} → H${level}`,
                 vscode.DiagnosticSeverity.Warning)
          );
        }
        prevHeadingLevel = level;
      }

      // 3. Missing space after heading hashes
      const noSpace = line.match(/^(#{1,6})[^\s#]/);
      if (noSpace) {
        diags.push(diag(i, 0, line.length, 'MD018 missing space after heading #', vscode.DiagnosticSeverity.Warning));
      }

      // 4. Consecutive blank lines
      if (line.trim() === '') {
        blankRun++;
        if (blankRun > 1) {
          diags.push(diag(i, 0, 0, 'MD012 multiple consecutive blank lines', vscode.DiagnosticSeverity.Information));
        }
      } else {
        blankRun = 0;
      }

      // 5. Bare URL (should use <url> or [text](url))
      const bareUrl = line.match(/(?<!\(|<|\])(https?:\/\/\S+)/);
      if (bareUrl && !line.includes('](')) {
        const start = line.indexOf(bareUrl[1]);
        diags.push(
          diag(i, start, start + bareUrl[1].length,
               'MD034 bare URL — use [text](url) or <url>',
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
  d.source = 'markdownJet';
  return d;
}
