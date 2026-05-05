import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './editor/markdownEditor';
import { registerEditCommands } from './edit/editCommands';
import { MarkdownLinter } from './lint/linter';
import { OutlineProvider } from './outline/outlineProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('[markdownPro] activated, registering custom editor markdownPro.editor');
  context.subscriptions.push(MarkdownEditorProvider.register(context));

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownPro.openInTextEditor', async (uri?: vscode.Uri) => {
      const target = uri ?? MarkdownEditorProvider.activeDoc?.uri;
      if (!target) {
        vscode.window.showWarningMessage('没有可打开的 Markdown 文件');
        return;
      }
      await vscode.commands.executeCommand(
        'vscode.openWith', target, 'default'
      );
    })
  );

  registerEditCommands(context);

  const linter = new MarkdownLinter();
  context.subscriptions.push(linter);

  const outline = new OutlineProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('markdownProOutline', outline),
    vscode.window.onDidChangeActiveTextEditor(() => outline.refresh()),
    vscode.window.tabGroups.onDidChangeTabs(() => outline.refresh()),
    vscode.workspace.onDidChangeTextDocument((e) => {
      const active = vscode.window.activeTextEditor?.document
        ?? MarkdownEditorProvider.activeDoc;
      if (active && e.document.uri.toString() === active.uri.toString()) {
        outline.refresh();
      }
    })
  );
}

export function deactivate() {}
