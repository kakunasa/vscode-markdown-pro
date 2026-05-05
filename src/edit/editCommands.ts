import * as vscode from 'vscode';
import { MarkdownEditorProvider } from '../editor/markdownEditor';

export function registerEditCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('markdownJet.insertTable', insertTable),
    vscode.commands.registerCommand('markdownJet.insertLink', insertLink),
    vscode.commands.registerCommand('markdownJet.insertImage', insertImage),
    vscode.commands.registerCommand('markdownJet.format', formatDocument)
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
  vscode.window.showWarningMessage('Open a Markdown file first.');
}

async function insertTable() {
  const rowsStr = await vscode.window.showInputBox({
    prompt: 'Body rows (excluding header)', value: '2', validateInput: numericValidator
  });
  if (!rowsStr) return;
  const colsStr = await vscode.window.showInputBox({
    prompt: 'Columns', value: '3', validateInput: numericValidator
  });
  if (!colsStr) return;

  const rows = parseInt(rowsStr, 10);
  const cols = parseInt(colsStr, 10);
  const header = '| ' + Array.from({ length: cols }, (_, i) => `Col ${i + 1}`).join(' | ') + ' |';
  const sep    = '| ' + Array.from({ length: cols }, () => '---').join(' | ') + ' |';
  const body = Array.from({ length: rows }, () =>
    '| ' + Array.from({ length: cols }, () => '   ').join(' | ') + ' |'
  ).join('\n');
  await insertText(`${header}\n${sep}\n${body}\n`);
}

async function insertLink() {
  const url = await vscode.window.showInputBox({ prompt: 'Link URL' });
  if (!url) return;
  const text = (await vscode.window.showInputBox({ prompt: 'Link text', value: url })) || url;
  await insertText(`[${text}](${url})`);
}

async function insertImage() {
  const choice = await vscode.window.showQuickPick(
    [
      { label: 'Local file', detail: 'Pick an image on disk; inserts a workspace-relative path.' },
      { label: 'URL',        detail: 'Type or paste a remote image URL.' }
    ],
    { placeHolder: 'Image source' }
  );
  if (!choice) return;

  let src: string | undefined;
  if (choice.label === 'Local file') {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }
    });
    if (!uris || !uris[0]) return;
    src = vscode.workspace.asRelativePath(uris[0]);
  } else {
    src = await vscode.window.showInputBox({ prompt: 'Image URL' });
    if (!src) return;
  }
  const alt = (await vscode.window.showInputBox({ prompt: 'Alt text', value: '' })) || '';
  await insertText(`![${alt}](${src})`);
}

async function formatDocument() {
  // Resolve the doc from native editor or custom-editor tracker
  const doc =
    vscode.window.activeTextEditor?.document
    ?? MarkdownEditorProvider.activeDoc;
  if (!doc || doc.languageId !== 'markdown') {
    vscode.window.showWarningMessage('Open a Markdown file first.');
    return;
  }
  const text = doc.getText();
  const formatted = formatMarkdown(text);
  if (formatted === text) {
    vscode.window.showInformationMessage('Document is already formatted.');
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
  if (Number.isNaN(n) || n <= 0 || n > 50) return 'Enter a number between 1 and 50.';
  return undefined;
}
