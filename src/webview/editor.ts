/**
 * Webview-side bundle. Bundled separately by esbuild (browser/iife) and
 * referenced from the customEditor's HTML via webview.asWebviewUri.
 *
 * Owns:
 *   - CodeMirror 6 editor (markdown grammar, syntax highlighting, line nums)
 *   - Mode switching via body class
 *   - Live preview rendering pipeline (Mermaid + KaTeX)
 *   - Bidirectional message protocol with the extension
 */
import { EditorState, Compartment } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection,
  highlightActiveLineGutter, dropCursor, rectangularSelection
} from '@codemirror/view';
import {
  syntaxHighlighting, defaultHighlightStyle, HighlightStyle,
  bracketMatching, foldGutter, indentOnInput, foldKeymap
} from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { tags as t } from '@lezer/highlight';

declare const acquireVsCodeApi: () => {
  postMessage(msg: unknown): void;
  setState(s: unknown): void;
  getState(): unknown;
};
declare global {
  interface Window {
    mermaid?: {
      initialize(opts: unknown): void;
      run(opts: { nodes: Element[] }): Promise<void>;
    };
    renderMathInElement?: (root: Element, opts: unknown) => void;
  }
}

const vscode = acquireVsCodeApi();

// ---------- DOM lookup ----------
const body = document.body;
const editorHost = document.getElementById('editor-host')!;
const preview = document.getElementById('preview')!;
// The actual scroll container is .preview-pane — `#preview` is the inner
// <article> and never scrolls itself.
const previewPane = document.querySelector<HTMLElement>('.preview-pane')!;

// ---------- Theme integration ----------
// VS Code adds vscode-light / vscode-dark / vscode-high-contrast to <body>.
function isDark(): boolean {
  return body.classList.contains('vscode-dark') ||
         body.classList.contains('vscode-high-contrast');
}

// Custom HighlightStyle matching VS Code-ish markdown colors. Tags from @lezer/highlight.
const lightHighlight = HighlightStyle.define([
  { tag: t.heading,        color: '#005cc5', fontWeight: 'bold' },
  { tag: t.strong,         fontWeight: 'bold' },
  { tag: t.emphasis,       fontStyle: 'italic', color: '#6f42c1' },
  { tag: t.strikethrough,  textDecoration: 'line-through', color: '#6a737d' },
  { tag: t.link,           color: '#0366d6', textDecoration: 'underline' },
  { tag: t.url,            color: '#0366d6' },
  { tag: t.monospace,      color: '#d73a49', backgroundColor: 'rgba(27,31,35,0.05)' },
  { tag: t.quote,          color: '#6a737d', fontStyle: 'italic' },
  { tag: t.list,           color: '#005cc5' },
  { tag: t.atom,           color: '#005cc5' },
  { tag: t.meta,           color: '#6a737d' },
  { tag: t.keyword,        color: '#d73a49', fontWeight: 'bold' },
  { tag: t.processingInstruction, color: '#6a737d' }
]);

const darkHighlight = HighlightStyle.define([
  { tag: t.heading,        color: '#79b8ff', fontWeight: 'bold' },
  { tag: t.strong,         fontWeight: 'bold' },
  { tag: t.emphasis,       fontStyle: 'italic', color: '#b392f0' },
  { tag: t.strikethrough,  textDecoration: 'line-through', color: '#6a737d' },
  { tag: t.link,           color: '#58a6ff', textDecoration: 'underline' },
  { tag: t.url,            color: '#58a6ff' },
  { tag: t.monospace,      color: '#ff7b72', backgroundColor: 'rgba(110,118,129,0.4)' },
  { tag: t.quote,          color: '#8b949e', fontStyle: 'italic' },
  { tag: t.list,           color: '#79b8ff' },
  { tag: t.atom,           color: '#79b8ff' },
  { tag: t.meta,           color: '#8b949e' },
  { tag: t.keyword,        color: '#ff7b72', fontWeight: 'bold' },
  { tag: t.processingInstruction, color: '#8b949e' }
]);

const vscodeTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'var(--vscode-editor-font-size, 13px)',
    fontFamily: "var(--vscode-editor-font-family, 'SF Mono', Menlo, Consolas, monospace)",
    backgroundColor: 'var(--vscode-editor-background)',
    color: 'var(--vscode-editor-foreground)'
  },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.55' },
  '.cm-content': {
    caretColor: 'var(--vscode-editorCursor-foreground)',
    padding: '14px 0'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--vscode-editorCursor-foreground)',
    borderLeftWidth: '2px'
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--vscode-editor-selectionBackground) !important'
  },
  '.cm-gutters': {
    backgroundColor: 'var(--vscode-editorGutter-background, transparent)',
    color: 'var(--vscode-editorLineNumber-foreground)',
    border: 'none'
  },
  '.cm-activeLine':       { backgroundColor: 'var(--vscode-editor-lineHighlightBackground)' },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--vscode-editor-lineHighlightBackground)',
    color: 'var(--vscode-editorLineNumber-activeForeground)'
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--vscode-editorWidget-background)',
    border: '1px solid var(--vscode-widget-border, transparent)',
    color: 'var(--vscode-foreground)'
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--vscode-editor-findMatchHighlightBackground)',
    outline: '1px solid var(--vscode-editor-findMatchHighlightBorder, transparent)'
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--vscode-editor-findMatchBackground)'
  }
}, { dark: false });

// ---------- CodeMirror state ----------
const highlightCompartment = new Compartment();

let lastSent = '';
let suppressNext = false; // suppress outbound on programmatic doc set

function buildState(initial: string): EditorState {
  return EditorState.create({
    doc: initial,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      history(),
      markdown({ base: markdownLanguage, codeLanguages: [] }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      highlightCompartment.of(syntaxHighlighting(isDark() ? darkHighlight : lightHighlight)),
      keymap.of([
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...foldKeymap,
        {
          key: 'Mod-s',
          run: () => { vscode.postMessage({ type: 'save' }); return true; }
        },
        {
          key: 'Mod-1',
          run: () => { setMode('edit'); return true; }
        },
        {
          key: 'Mod-2',
          run: () => {
            // Cmd/Ctrl+2 toggles between horizontal and vertical both layouts.
            const cur = body.classList.contains('mode-both') ? 'both'
              : body.classList.contains('mode-both-vertical') ? 'both-vertical'
              : '';
            setMode(cur === 'both' ? 'both-vertical' : 'both');
            return true;
          }
        },
        {
          key: 'Mod-3',
          run: () => { setMode('preview'); return true; }
        }
      ]),
      vscodeTheme,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        if (suppressNext) { suppressNext = false; return; }
        const text = update.state.doc.toString();
        if (text === lastSent) return;
        lastSent = text;
        vscode.postMessage({ type: 'edit', text });
      })
    ]
  });
}

const view = new EditorView({
  state: buildState(''),
  parent: editorHost
});

// ---------- Mode switching ----------
type ViewMode = 'edit' | 'both' | 'both-vertical' | 'preview';

function setMode(mode: ViewMode, silent = false) {
  body.classList.remove('mode-edit', 'mode-both', 'mode-both-vertical', 'mode-preview');
  body.classList.add('mode-' + mode);
  // Reflow CodeMirror so it picks up the new container size after CSS change.
  requestAnimationFrame(() => view.requestMeasure());
  if (!silent) vscode.postMessage({ type: 'modeChanged', mode });
}

// ---------- Preview rendering ----------
let mermaidReady = false;
function initMermaid(theme: string) {
  if (window.mermaid) {
    window.mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'loose' });
    mermaidReady = true;
  }
}

function renderMath(root: Element) {
  if (window.renderMathInElement) {
    try {
      window.renderMathInElement(root, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$',  right: '$',  display: false }
        ],
        throwOnError: false
      });
    } catch (e) { console.warn('katex error', e); }
  }
}

async function runMermaid(root: Element) {
  if (!mermaidReady || !window.mermaid) return;
  const nodes = root.querySelectorAll<HTMLElement>('.mermaid:not([data-processed="true"])');
  if (!nodes.length) return;
  try {
    await window.mermaid.run({ nodes: Array.from(nodes) });
  } catch (e) { console.warn('mermaid error', e); }
}

async function applyPreview(html: string) {
  const max = Math.max(1, previewPane.scrollHeight - previewPane.clientHeight);
  const ratio = previewPane.scrollTop / max;
  preview.innerHTML = html;
  renderMath(preview);
  await runMermaid(preview);
  const newMax = Math.max(0, previewPane.scrollHeight - previewPane.clientHeight);
  previewPane.scrollTop = newMax * ratio;
}

// ---------- Scroll sync (editor ↔ preview) ----------
// Both sides set this flag while *programmatically* scrolling so the other
// side's listener doesn't ping-pong us back.
let suppressScrollSync = false;
let releaseRaf = 0;
function releaseSyncSoon() {
  if (releaseRaf) cancelAnimationFrame(releaseRaf);
  releaseRaf = requestAnimationFrame(() => {
    releaseRaf = requestAnimationFrame(() => {
      releaseRaf = 0;
      suppressScrollSync = false;
    });
  });
}

function previewElementsWithLine(): { el: HTMLElement; line: number }[] {
  const out: { el: HTMLElement; line: number }[] = [];
  preview.querySelectorAll<HTMLElement>('[data-source-line]').forEach((el) => {
    const ln = Number(el.getAttribute('data-source-line'));
    if (!Number.isNaN(ln)) out.push({ el, line: ln });
  });
  return out;
}

/** Element's vertical offset within the preview-pane scroll content. */
function offsetWithinPane(el: HTMLElement): number {
  const paneRect = previewPane.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return elRect.top - paneRect.top + previewPane.scrollTop;
}

/** Scroll preview so the element corresponding to `editorLine` is at the top. */
function syncPreviewToLine(editorLine: number) {
  const items = previewElementsWithLine();
  if (!items.length) return;
  let before = items[0];
  let after: typeof before | undefined;
  for (let i = 0; i < items.length; i++) {
    if (items[i].line <= editorLine) before = items[i];
    else { after = items[i]; break; }
  }
  let targetTop: number;
  if (!after) {
    targetTop = offsetWithinPane(before.el);
  } else {
    const span = after.line - before.line || 1;
    const frac = (editorLine - before.line) / span;
    const beforeTop = offsetWithinPane(before.el);
    const afterTop  = offsetWithinPane(after.el);
    targetTop = beforeTop + (afterTop - beforeTop) * frac;
  }
  suppressScrollSync = true;
  previewPane.scrollTop = targetTop;
  releaseSyncSoon();
}

/** Scroll editor so `editorLine` is at the top of the viewport. */
function syncEditorToLine(editorLine: number) {
  const docLine = Math.max(1, Math.min(view.state.doc.lines, editorLine + 1));
  const pos = view.state.doc.line(docLine).from;
  suppressScrollSync = true;
  view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start' }) });
  releaseSyncSoon();
}

/** What's the source line at the top of the editor's viewport? */
function editorTopLine(): number {
  const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop + 1);
  return view.state.doc.lineAt(block.from).number - 1; // 0-indexed
}

/** Source line of the topmost preview element currently visible. */
function previewTopLine(): number {
  const items = previewElementsWithLine();
  if (!items.length) return 0;
  const paneTop = previewPane.getBoundingClientRect().top;
  let topLine = items[0].line;
  for (const { el, line } of items) {
    const r = el.getBoundingClientRect();
    if (r.top <= paneTop + 4) {
      topLine = line;
    } else {
      break;
    }
  }
  return topLine;
}

let scrollFromEditorRaf = 0;
view.scrollDOM.addEventListener('scroll', () => {
  if (suppressScrollSync) return;
  if (!body.classList.contains('mode-both') && !body.classList.contains('mode-both-vertical')) return;
  if (scrollFromEditorRaf) cancelAnimationFrame(scrollFromEditorRaf);
  scrollFromEditorRaf = requestAnimationFrame(() => {
    scrollFromEditorRaf = 0;
    syncPreviewToLine(editorTopLine());
  });
});

let scrollFromPreviewRaf = 0;
previewPane.addEventListener('scroll', () => {
  if (suppressScrollSync) return;
  if (!body.classList.contains('mode-both') && !body.classList.contains('mode-both-vertical')) return;
  if (scrollFromPreviewRaf) cancelAnimationFrame(scrollFromPreviewRaf);
  scrollFromPreviewRaf = requestAnimationFrame(() => {
    scrollFromPreviewRaf = 0;
    syncEditorToLine(previewTopLine());
  });
});

// ---------- Theme reactivity ----------
// VS Code may swap theme classes on <body> at runtime. Re-pick highlight + mermaid theme.
const themeObserver = new MutationObserver(() => {
  view.dispatch({
    effects: highlightCompartment.reconfigure(
      syntaxHighlighting(isDark() ? darkHighlight : lightHighlight)
    )
  });
  // Re-init mermaid with new theme so subsequent diagrams pick it up.
  // (Already-rendered diagrams keep their old colors until re-rendered.)
  initMermaid(isDark() ? 'dark' : 'default');
});
themeObserver.observe(body, { attributes: true, attributeFilter: ['class', 'data-vscode-theme-kind'] });

// ---------- Inbound messages ----------
window.addEventListener('message', async (e) => {
  const msg = e.data;
  if (!msg) return;
  switch (msg.type) {
    case 'load': {
      if (msg.text !== view.state.doc.toString()) {
        suppressNext = true;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: msg.text }
        });
        lastSent = msg.text;
      }
      if (msg.mode) setMode(msg.mode, true);
      break;
    }
    case 'preview':
      await applyPreview(msg.html);
      break;
    case 'setMode':
      setMode(msg.mode, !!msg.silent);
      break;
    case 'replaceSelection': {
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: msg.text },
        selection: { anchor: from + msg.text.length }
      });
      view.focus();
      break;
    }
    case 'reveal': {
      // Outline → jump to a specific source line in editor + preview.
      const line = Number(msg.line);
      if (Number.isNaN(line)) break;
      const docLine = Math.max(1, Math.min(view.state.doc.lines, line + 1));
      const pos = view.state.doc.line(docLine).from;
      suppressScrollSync = true;
      view.dispatch({
        selection: { anchor: pos, head: pos },
        effects: EditorView.scrollIntoView(pos, { y: 'center' })
      });
      view.focus();
      const target = preview.querySelector<HTMLElement>(`[data-source-line="${line}"]`);
      if (target) {
        previewPane.scrollTop = offsetWithinPane(target);
      }
      releaseSyncSoon();
      break;
    }
  }
});

// ---------- Boot ----------
initMermaid(isDark() ? 'dark' : 'default');
vscode.postMessage({ type: 'ready' });
