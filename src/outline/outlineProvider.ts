import * as vscode from 'vscode';
import { MarkdownEditorProvider } from '../editor/markdownEditor';

export class OutlineItem extends vscode.TreeItem {
  children: OutlineItem[] = [];
  constructor(
    public readonly label: string,
    public readonly level: number,
    public readonly line: number,
    public readonly resource: vscode.Uri
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('symbol-namespace');
    this.command = {
      command: 'markdownPro.revealLine',
      title: '跳转到标题',
      arguments: [resource, line]
    };
    this.tooltip = `H${level}  Line ${line + 1}`;
  }
}

export class OutlineProvider implements vscode.TreeDataProvider<OutlineItem> {
  private _onDidChange = new vscode.EventEmitter<OutlineItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  refresh() {
    this._onDidChange.fire();
  }

  getTreeItem(element: OutlineItem): vscode.TreeItem {
    if (element.children.length > 0) {
      element.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    }
    return element;
  }

  getChildren(element?: OutlineItem): OutlineItem[] {
    if (element) return element.children;

    // Prefer the doc shown in our custom editor (no native TextEditor exists
    // when the markdownPro.editor webview is focused). Fall back to the
    // standard active text editor.
    const doc =
      MarkdownEditorProvider.activeDoc
      ?? (vscode.window.activeTextEditor?.document.languageId === 'markdown'
            ? vscode.window.activeTextEditor.document
            : undefined);
    if (!doc) return [];

    const lines = doc.getText().split('\n');
    const flat: OutlineItem[] = [];
    let inFence = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (m) {
        flat.push(new OutlineItem(m[2], m[1].length, i, doc.uri));
      }
    }

    return buildTree(flat);
  }
}

function buildTree(items: OutlineItem[]): OutlineItem[] {
  const roots: OutlineItem[] = [];
  const stack: OutlineItem[] = [];
  for (const item of items) {
    while (stack.length && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(item);
    } else {
      stack[stack.length - 1].children.push(item);
    }
    stack.push(item);
  }
  return roots;
}
