import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './editor/markdownEditor';
import { registerEditCommands } from './edit/editCommands';
import { MarkdownLinter } from './lint/linter';
import { OutlineProvider } from './outline/outlineProvider';

const DISMISSED_KEY = 'markdownJet.dismissedDefaultPrompt';

export function activate(context: vscode.ExtensionContext) {
  console.log('[markdownJet] activated');
  context.subscriptions.push(MarkdownEditorProvider.register(context));

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownJet.openInTextEditor', async (uri?: vscode.Uri) => {
      const target = uri ?? MarkdownEditorProvider.activeDoc?.uri;
      if (!target) {
        vscode.window.showWarningMessage('No Markdown file to open');
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', target, 'default');
    }),

    vscode.commands.registerCommand('markdownJet.setAsDefault', async () => {
      await setMarkdownJetAsDefault();
      vscode.window.showInformationMessage(
        '✓ MarkdownJet is now the default editor for *.md and *.markdown. ' +
        'Reopen any markdown file to see the change.'
      );
    }),

    vscode.commands.registerCommand('markdownJet.resetDefaultPrompt', async () => {
      await context.globalState.update(DISMISSED_KEY, undefined);
      vscode.window.showInformationMessage('MarkdownJet "set as default" prompt re-enabled.');
    })
  );

  registerEditCommands(context);

  const linter = new MarkdownLinter();
  context.subscriptions.push(linter);

  const outline = new OutlineProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('markdownJetOutline', outline),
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

  // Run after a short delay so the prompt doesn't appear during VS Code startup.
  setTimeout(() => {
    maybePromptOnConflict(context).catch((err) =>
      console.warn('[markdownJet] conflict prompt failed', err)
    );
  }, 1500);
}

/**
 * Deactivate is intentionally a no-op now. We *don't* want to clear the
 * user's `editorAssociations` on every VS Code shutdown — that caused the
 * settings to flicker on/off across reloads. The reliable cleanup happens
 * via the `vscode:uninstall` Node script, which runs outside the extension
 * host when the user actually uninstalls.
 */
export function deactivate(): void {
  // no-op
}

/**
 * Only show a prompt when there is a *real* conflict — i.e., the user has
 * explicitly mapped `*.md` to some other editor in their settings. With no
 * mapping, our `customEditors[].priority = "default"` already wins and we
 * don't need to touch settings at all (so uninstall leaves zero residue).
 */
async function maybePromptOnConflict(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get<boolean>(DISMISSED_KEY)) return;

  const cfg = vscode.workspace.getConfiguration('workbench');
  const assoc = cfg.get<Record<string, string>>('editorAssociations') ?? {};
  const current = assoc['*.md'];

  // No mapping at all → priority:"default" handles it. Don't prompt, don't write.
  if (!current) return;
  // Already us → already correct. Don't prompt.
  if (current === MarkdownEditorProvider.viewType) return;

  const setBtn = 'Override and Use MarkdownJet';
  const onceBtn = 'Just for This File';
  const neverBtn = "Don't Show Again";

  const choice = await vscode.window.showInformationMessage(
    `MarkdownJet noticed your settings map *.md to "${current}". ` +
    `Override so MarkdownJet opens markdown files by default?`,
    setBtn, onceBtn, neverBtn
  );

  if (choice === setBtn) {
    await setMarkdownJetAsDefault();
    vscode.window.showInformationMessage(
      '✓ MarkdownJet set as default. Reopen any *.md tab to switch.'
    );
    await context.globalState.update(DISMISSED_KEY, true);
  } else if (choice === onceBtn) {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'markdown') {
      await vscode.commands.executeCommand(
        'vscode.openWith', editor.document.uri, MarkdownEditorProvider.viewType
      );
    } else {
      vscode.window.showInformationMessage(
        'Open a Markdown file first, then re-run "MarkdownJet: Set as Default Markdown Editor" if you want.'
      );
    }
    // Don't dismiss — they may want to set as default later.
  } else if (choice === neverBtn) {
    await context.globalState.update(DISMISSED_KEY, true);
  }
}

/** Write our viewType into `workbench.editorAssociations`. Will be cleaned
 *  up by the `vscode:uninstall` script when the user uninstalls. */
async function setMarkdownJetAsDefault(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('workbench');
  const existing = cfg.get<Record<string, string>>('editorAssociations') ?? {};
  await cfg.update(
    'editorAssociations',
    {
      ...existing,
      '*.md': MarkdownEditorProvider.viewType,
      '*.markdown': MarkdownEditorProvider.viewType
    },
    vscode.ConfigurationTarget.Global
  );
}
