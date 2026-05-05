/**
 * Standalone Node script — runs as `vscode:uninstall` script when the
 * extension is uninstalled. NO `vscode` API is available here (we run
 * outside the extension host). We just touch settings.json directly
 * and remove our `*.md` / `*.markdown` editor associations so that .md
 * files don't end up pointing at a missing viewType.
 *
 * Strategy: regex-replace the specific lines we wrote. We never inserted
 * anything else into the user's settings.json, and the lines are always
 * single-line `"key": "value",?` entries written by VS Code's settings
 * service. So a line-level regex is reliable here and avoids pulling in
 * a JSONC parser into the uninstall bundle.
 *
 * Best-effort: if anything goes wrong we silently no-op.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const VIEW_TYPE = 'markdownJet.editor';
// Match lines like:  "*.md": "markdownJet.editor",
// Allow surrounding whitespace, optional trailing comma, optional CR.
const LINE_RE = new RegExp(
  String.raw`^[ \t]*"\*\.(?:md|markdown)"\s*:\s*"` + VIEW_TYPE + String.raw`"\s*,?[ \t]*\r?\n`,
  'gm'
);

function settingsPaths(): string[] {
  const home = os.homedir();
  const platform = os.platform();
  const variants = ['Code', 'Code - Insiders', 'VSCodium', 'Cursor'];
  const out: string[] = [];

  let baseDirs: string[];
  if (platform === 'darwin') {
    baseDirs = [path.join(home, 'Library/Application Support')];
  } else if (platform === 'win32') {
    baseDirs = [process.env.APPDATA || path.join(home, 'AppData/Roaming')];
  } else {
    baseDirs = [path.join(home, '.config')];
  }

  for (const baseDir of baseDirs) {
    for (const variant of variants) {
      out.push(path.join(baseDir, variant, 'User', 'settings.json'));
    }
  }
  return out;
}

function cleanFile(file: string): void {
  if (!fs.existsSync(file)) return;
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }

  const cleaned = text.replace(LINE_RE, '');
  if (cleaned === text) return;

  try {
    fs.writeFileSync(file, cleaned, 'utf8');
    console.log(`[markdownJet uninstall] cleaned ${file}`);
  } catch {
    // ignore — user can fix manually
  }
}

for (const file of settingsPaths()) {
  try { cleanFile(file); } catch { /* swallow per-file failures */ }
}
