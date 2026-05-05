import * as vscode from 'vscode';
import { MarkdownEditorProvider } from '../editor/markdownEditor';

export function registerEditCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('markdownPro.insertTable', insertTable),
    vscode.commands.registerCommand('markdownPro.insertLink', insertLink),
    vscode.commands.registerCommand('markdownPro.insertImage', insertImage),
    vscode.commands.registerCommand('markdownPro.format', formatDocument)
  );
}

/** Insert text at the cursor — works in both native text editors and our
 *  custom editor (via postMessage to the active webview). */
async function insertText(text: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.languageId === 'markdown') {
    await editor.edit((eb) => eb.replace(editor.selection, text));
    return;
  }
  const panel = MarkdownEditorProvider.activeWebview;
  if (panel) {
    panel.webview.postMessage({ type: 'replaceSelection', text });
    return;
  }
  vscode.window.showWarningMessage('请先打开一个 Markdown 文件');
}

async function insertTable() {
  const rowsStr = await vscode.window.showInputBox({
    prompt: '行数(不含表头)', value: '2', validateInput: numericValidator
  });
  if (!rowsStr) return;
  const colsStr = await vscode.window.showInputBox({
    prompt: '列数', value: '3', validateInput: numericValidator
  });
  if (!colsStr) return;

  const rows = parseInt(rowsStr, 10);
  const cols = parseInt(colsStr, 10);
  const header = '| ' + Array.from({ length: cols }, (_, i) => `列${i + 1}`).join(' | ') + ' |';
  const sep    = '| ' + Array.from({ length: cols }, () => '---').join(' | ') + ' |';
  const body = Array.from({ length: rows }, () =>
    '| ' + Array.from({ length: cols }, () => '   ').join(' | ') + ' |'
  ).join('\n');
  await insertText(`${header}\n${sep}\n${body}\n`);
}

async function insertLink() {
  const url = await vscode.window.showInputBox({ prompt: '链接 URL' });
  if (!url) return;
  const text = (await vscode.window.showInputBox({ prompt: '显示文本', value: url })) || url;
  await insertText(`[${text}](${url})`);
}

async function insertImage() {
  const choice = await vscode.window.showQuickPick(
    [
      { label: '本地文件', detail: '选择磁盘上的图片插入相对路径' },
      { label: 'URL',      detail: '输入图片 URL' }
    ],
    { placeHolder: '插入图片来源' }
  );
  if (!choice) return;

  let src: string | undefined;
  if (choice.label === '本地文件') {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }
    });
    if (!uris || !uris[0]) return;
    src = vscode.workspace.asRelativePath(uris[0]);
  } else {
    src = await vscode.window.showInputBox({ prompt: '图片 URL' });
    if (!src) return;
  }
  const alt = (await vscode.window.showInputBox({ prompt: 'alt 文本', value: '' })) || '';
  await insertText(`![${alt}](${src})`);
}

async function formatDocument() {
  // Resolve the doc from native editor or custom-editor tracker
  const doc =
    vscode.window.activeTextEditor?.document
    ?? MarkdownEditorProvider.activeDoc;
  if (!doc || doc.languageId !== 'markdown') {
    vscode.window.showWarningMessage('请先打开一个 Markdown 文件');
    return;
  }
  const text = doc.getText();
  const formatted = formatMarkdown(text);
  if (formatted === text) {
    vscode.window.showInformationMessage('已经是格式化状态');
    return;
  }
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(text.length));
  edit.replace(doc.uri, fullRange, formatted);
  await vscode.workspace.applyEdit(edit);
}

function formatMarkdown(text: string): string {
  const lines = text.split('\n').map((line) => {
    if (line.endsWith('  ')) return line.replace(/[ \t]+$/, '  ');
    return line.replace(/[ \t]+$/, '');
  });
  const out: string[] = [];
  let blankRun = 0;
  for (const line of lines) {
    if (line === '') {
      blankRun++;
      if (blankRun <= 1) out.push(line);
    } else {
      blankRun = 0;
      out.push(line);
    }
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n') + '\n';
}

function numericValidator(v: string): string | undefined {
  const n = parseInt(v, 10);
  if (Number.isNaN(n) || n <= 0 || n > 50) return '请输入 1-50 之间的数字';
  return undefined;
}
