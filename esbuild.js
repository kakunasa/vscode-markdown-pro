const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

function copyVendorAssets() {
  const vendorDir = path.join(__dirname, 'media', 'vendor');
  fs.mkdirSync(vendorDir, { recursive: true });

  const files = [
    ['node_modules/mermaid/dist/mermaid.min.js',                'mermaid.min.js'],
    ['node_modules/katex/dist/katex.min.js',                    'katex.min.js'],
    ['node_modules/katex/dist/katex.min.css',                   'katex.min.css'],
    ['node_modules/katex/dist/contrib/auto-render.min.js',      'katex-auto-render.min.js']
  ];
  for (const [src, dst] of files) {
    fs.copyFileSync(path.join(__dirname, src), path.join(vendorDir, dst));
  }
  // KaTeX font directory (referenced by katex.min.css via relative url(fonts/...))
  fs.cpSync(
    path.join(__dirname, 'node_modules/katex/dist/fonts'),
    path.join(vendorDir, 'fonts'),
    { recursive: true }
  );

  // Build a single highlight.css that scopes github/github-dark to body theme classes.
  buildHighlightCss(vendorDir);
}

function buildHighlightCss(vendorDir) {
  const lightCss = fs.readFileSync(
    path.join(__dirname, 'node_modules/highlight.js/styles/github.min.css'), 'utf8'
  );
  const darkCss = fs.readFileSync(
    path.join(__dirname, 'node_modules/highlight.js/styles/github-dark.min.css'), 'utf8'
  );
  const combined =
    `/* highlight.js github (light) */\n` + scopeSelectors(lightCss, ['body.vscode-light']) +
    `\n/* highlight.js github-dark */\n`  + scopeSelectors(darkCss,  ['body.vscode-dark', 'body.vscode-high-contrast']);
  fs.writeFileSync(path.join(vendorDir, 'highlight.css'), combined);
}

/**
 * Prefix every CSS selector with each scope so we can ship two themes in one
 * file and let body.vscode-light / body.vscode-dark pick the active one.
 *
 * Important: each scope must be applied to *every* selector in a comma-separated
 * list. e.g., for scopes [A, B] and selectors `.foo, .bar`, output must be
 * `A .foo, A .bar, B .foo, B .bar` — not `A, B .foo, A, B .bar` which CSS would
 * interpret as `A` (matching everything!) plus `B .foo` etc.
 */
function scopeSelectors(css, scopes) {
  const scopeList = Array.isArray(scopes) ? scopes : [scopes];
  // Strip comments
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return css.replace(/([^{}@]+?)\{([^{}]*)\}/g, (_m, selectors, body) => {
    const sels = selectors.split(',').map((s) => s.trim()).filter(Boolean);
    const expanded = [];
    for (const scope of scopeList) {
      for (const sel of sels) {
        expanded.push(`${scope} ${sel}`);
      }
    }
    return `${expanded.join(', ')} { ${body.trim()} }\n`;
  });
}

// Bypass any Yarn PnP manifest in parent dirs by resolving bare imports
// against the project-local node_modules ourselves.
const localResolver = {
  name: 'local-node-modules',
  setup(build) {
    const projectRoot = __dirname;
    build.onResolve({ filter: /^[^./].*$/ }, (args) => {
      if (args.kind === 'entry-point') return null;
      if (args.path === 'vscode') return null;
      try {
        const resolved = require.resolve(args.path, {
          paths: [path.join(projectRoot, 'node_modules'), projectRoot]
        });
        // Node built-ins (e.g. "https", "fs/promises") resolve to a bare name
        if (!path.isAbsolute(resolved)) return { path: resolved, external: true };
        return { path: resolved };
      } catch {
        return null;
      }
    });
  }
};

async function main() {
  copyVendorAssets();

  const extCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    sourcemap: !production,
    minify: production,
    logLevel: 'info',
    plugins: [localResolver]
  });

  // Webview bundle: CodeMirror + UI logic, runs in the browser-like webview.
  const webviewCtx = await esbuild.context({
    entryPoints: ['src/webview/editor.ts'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    outfile: 'dist/webview.js',
    sourcemap: !production,
    minify: production,
    logLevel: 'info',
    plugins: [localResolver]
  });

  if (watch) {
    await Promise.all([extCtx.watch(), webviewCtx.watch()]);
  } else {
    await Promise.all([extCtx.rebuild(), webviewCtx.rebuild()]);
    await Promise.all([extCtx.dispose(), webviewCtx.dispose()]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
