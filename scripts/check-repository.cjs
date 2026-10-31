// Check version-controlled inputs, not ignored local build products or credentials.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const tracked = new Set(files);
const errors = [];
const rawDesigns = new Set([
  'docs/design/source/KELING_UPGRADE_DESIGN_2026-10-30.md',
  'docs/design/source/KELING_GAMIFIED_UPGRADE_PLAN_FINAL_2026-10-30.md',
]);

for (const file of files) {
  if (/(^|\/)(node_modules|dist|dist-esm|dev-dist|build|\.cache|\.gradle)\//.test(file) ||
      /^(apps\/web\/public\/stellar|apps\/android\/app\/src\/main\/(?:assets\/stellar|optimizedAssets))\//.test(file) ||
      /\.(apk|aab|apks|db|jks|keystore|log|tsbuildinfo)$/.test(file)) {
    errors.push('Generated or private file is tracked: ' + file);
  }
  if (/(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.example')) errors.push('Private environment file is tracked: ' + file);
  if (file.endsWith('package-lock.json') && file !== 'package-lock.json') errors.push('Use the root workspace lock: ' + file);
  if (/c__Users_|AppData_Roaming|workspaceStorage_/.test(file)) errors.push('Machine-specific asset filename: ' + file);
  if (!fs.existsSync(path.join(root, file))) errors.push('Tracked file is missing: ' + file);
}

const containsTarget = file => tracked.has(file) || files.some(item => item.startsWith(file.replace(/\/$/, '') + '/'));
for (const file of files.filter(name => name.endsWith('.md') && !rawDesigns.has(name))) {
  if (!fs.existsSync(path.join(root, file))) continue;
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/```[\s\S]*?```/g, '');
  const links = [...source.matchAll(/!?\[[^\]\n]*\]\(([^\n)]+)\)/g)].map(match => match[1]);
  links.push(...[...source.matchAll(/(?:href|src)=["']([^"']+)["']/g)].map(match => match[1]));
  for (const raw of links) {
    let target = raw.trim().replace(/^<|>$/g, '').split(/ ["']/)[0].split('#')[0];
    if (!target || /^(?:[\w+.-]+:|\/)/.test(target)) continue;
    try { target = decodeURIComponent(target); } catch { errors.push('Invalid link in ' + file); continue; }
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
    if (resolved.startsWith('../') || !containsTarget(resolved)) errors.push('Untracked local link: ' + file + ' -> ' + target);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Repository checks passed: ${files.length} tracked files, one npm lock, no generated mirrors or broken local document links.`);
}
