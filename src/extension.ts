import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './editor/markdownEditor';
import { registerEditCommands } from './edit/editCommands';
import { MarkdownLinter } from './lint/linter';
import { OutlineProvider } from './outline/outlineProvider';

const DISMISSED_KEY = 'markdownJet.dismissedDefaultPrompt';
/** Saved snapshot of the user's `*.md` / `*.markdown` editor associations
 *  *before* we wrote our own. Used to restore on uninstall/deactivate. */
const PREV_ASSOC_KEY = 'markdownJet.previousEditorAssociations';

export function activate(context: vscode.ExtensionContext) {
  console.log('[markdownJet] activated, registering custom editor markdownJet.editor');
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
      await setMarkdownJetAsDefault(context);
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

  // Stash the activation context for deactivate() — VS Code doesn't pass it.
  deactivateCtx = context;

  // If the user previously chose "Set as Default" but our deactivate hook
  // (last shutdown) cleared the association, silently re-apply it now.
  // No prompt needed — they already opted in.
  setTimeout(() => {
    reapplyDefaultIfPreviouslyOptedIn(context).catch(() => {});
    maybePromptForDefaultEditor(context).catch((err) =>
      console.warn('[markdownJet] default-editor prompt failed', err)
    );
  }, 1500);
}

async function reapplyDefaultIfPreviouslyOptedIn(context: vscode.ExtensionContext): Promise<void> {
  const hasSnapshot = context.globalState.get(PREV_ASSOC_KEY);
  if (!hasSnapshot) return; // user never opted in
  const cfg = vscode.workspace.getConfiguration('workbench');
  const assoc = cfg.get<Record<string, string>>('editorAssociations') ?? {};
  if (assoc['*.md'] === MarkdownEditorProvider.viewType) return; // already set
  // Re-apply silently
  await cfg.update(
    'editorAssociations',
    {
      ...assoc,
      '*.md': MarkdownEditorProvider.viewType,
      '*.markdown': MarkdownEditorProvider.viewType
    },
    vscode.ConfigurationTarget.Global
  );
}

let deactivateCtx: vscode.ExtensionContext | undefined;

/**
 * Called by VS Code on extension deactivation — including **uninstall**.
 *
 * If we previously wrote `*.md` / `*.markdown` into the user's
 * `workbench.editorAssociations`, restore the prior values (or remove our
 * entries entirely if there was nothing before). This prevents the dreaded
 * "uninstalled MarkdownJet, now no .md file opens" failure mode.
 *
 * VS Code awaits the returned promise. The settings update needs to flush
 * before the extension host tears us down.
 */
export async function deactivate(): Promise<void> {
  console.log('[markdownJet] deactivating — restoring editor associations');
  try {
    const cfg = vscode.workspace.getConfiguration('workbench');
    const assoc = { ...(cfg.get<Record<string, string>>('editorAssociations') ?? {}) };
    const prev = deactivateCtx?.globalState.get<Record<string, string | undefined>>(PREV_ASSOC_KEY) ?? {};

    let changed = false;
    for (const pat of ['*.md', '*.markdown']) {
      if (assoc[pat] === MarkdownEditorProvider.viewType) {
        const before = prev[pat];
        if (before === undefined || before === null || before === '') {
          delete assoc[pat];
        } else {
          assoc[pat] = before;
        }
        changed = true;
      }
    }

    if (changed) {
      await cfg.update('editorAssociations', assoc, vscode.ConfigurationTarget.Global);
    }
  } catch (e) {
    console.warn('[markdownJet] failed to restore editor associations during deactivate', e);
  }
}

/**
 * If the user already has *.md associated with someone else (or hasn't been
 * asked yet), show a one-time notification offering to take over.
 */
async function maybePromptForDefaultEditor(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get<boolean>(DISMISSED_KEY)) return;

  const cfg = vscode.workspace.getConfiguration('workbench');
  const assoc = cfg.get<Record<string, string>>('editorAssociations') ?? {};
  const current = assoc['*.md'];

  if (current === MarkdownEditorProvider.viewType) return;

  const conflictNote = current
    ? `Currently *.md opens with "${current}".`
    : `*.md does not have an explicit default editor.`;

  const setBtn = 'Set as Default';
  const onceBtn = 'Reopen Current File Only';
  const neverBtn = "Don't Show Again";

  const choice = await vscode.window.showInformationMessage(
    `Make MarkdownJet your default Markdown editor?  ${conflictNote}`,
    setBtn, onceBtn, neverBtn
  );

  if (choice === setBtn) {
    await setMarkdownJetAsDefault(context);
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
  } else if (choice === neverBtn) {
    await context.globalState.update(DISMISSED_KEY, true);
  }
}

/**
 * Write our `markdownJet.editor` viewType into `workbench.editorAssociations`
 * for `*.md` and `*.markdown`. Snapshot the previous values first so we can
 * restore them on `deactivate()`.
 */
async function setMarkdownJetAsDefault(context: vscode.ExtensionContext): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('workbench');
  const existing = cfg.get<Record<string, string>>('editorAssociations') ?? {};

  // Save a snapshot of what was here before we touched it. Only save once —
  // re-running setAsDefault later shouldn't overwrite the original snapshot.
  const previousSnapshot = context.globalState.get<Record<string, string | undefined>>(PREV_ASSOC_KEY);
  if (!previousSnapshot) {
    await context.globalState.update(PREV_ASSOC_KEY, {
      '*.md': existing['*.md'],
      '*.markdown': existing['*.markdown']
    });
  }

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
