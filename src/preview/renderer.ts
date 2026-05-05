import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/common';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlight(str: string, lang: string): string {
  const escaped = escapeHtml(str);
  if (lang === 'mermaid') {
    return `<div class="mermaid">${escaped}</div>`;
  }
  if (lang && hljs.getLanguage(lang)) {
    try {
      const out = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
      return `<pre><code class="hljs language-${lang}">${out}</code></pre>`;
    } catch {
      // fall through
    }
  }
  if (!lang && str.trim()) {
    try {
      const out = hljs.highlightAuto(str).value;
      return `<pre><code class="hljs">${out}</code></pre>`;
    } catch {
      // fall through
    }
  }
  return `<pre><code class="hljs">${escaped}</code></pre>`;
}

const md: MarkdownIt = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight
});

// Inject data-source-line on every block-level token that has source mapping.
// The webview uses these to drive scroll sync between editor and preview.
md.core.ruler.push('add_source_line', (state) => {
  for (const token of state.tokens) {
    if (token.map && token.tag) {
      token.attrSet('data-source-line', String(token.map[0]));
    }
  }
  return false;
});

// Override fence to keep Mermaid blocks separate from highlighted code blocks.
const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const lineAttr = token.map ? ` data-source-line="${token.map[0]}"` : '';
  if (token.info.trim() === 'mermaid') {
    return `<div class="mermaid"${lineAttr}>${escapeHtml(token.content)}</div>`;
  }
  const html = defaultFence(tokens, idx, options, env, self);
  // Highlight callback emits `<pre><code …>…</pre>`. Inject the line attr into <pre>.
  return lineAttr && html.startsWith('<pre') ? html.replace('<pre', `<pre${lineAttr}`) : html;
};

// Image rule: pull the (possibly rewritten) src from env.resolveImage.
const defaultImage = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const srcIndex = token.attrIndex('src');
  if (srcIndex >= 0 && env && typeof env.resolveImage === 'function') {
    token.attrs![srcIndex][1] = env.resolveImage(token.attrs![srcIndex][1]);
  }
  return defaultImage(tokens, idx, options, env, self);
};

export interface RenderOptions {
  resolveImage?: (src: string) => string;
}

export function renderBody(source: string, opts: RenderOptions = {}): string {
  return md.render(source, opts);
}
