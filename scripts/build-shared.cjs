const path = require('node:path'), fs = require('node:fs'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), shared = path.join(root, 'packages/shared');
const cli = require.resolve('typescript/bin/tsc', { paths: [shared] });
for (const args of [[], ['--module', 'ESNext', '--moduleResolution', 'node', '--outDir', 'dist-esm']]) {
  const result = spawnSync(process.execPath, [cli, '-p', 'tsconfig.json', ...args], { cwd: shared, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
fs.writeFileSync(path.join(shared, 'dist-esm/package.json'), '{"type":"module"}\n');
