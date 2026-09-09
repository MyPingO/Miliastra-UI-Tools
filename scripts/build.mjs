import { mkdir, cp, readFile, writeFile, readdir, rm, lstat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)],
      ),
    )
  ).flat();
}
for (const file of [
  ...(await files(path.join(root, 'src'))),
  ...(await files(path.join(root, 'assets'))),
]) {
  if (!file.endsWith('.mjs')) continue;
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr);
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/from ['"](\.[^'"]+)['"]/g))
    await readFile(path.resolve(path.dirname(file), match[1]));
}
const html = await readFile(path.join(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g))
  await readFile(path.join(root, match[1]));
if (/<iframe/i.test(html)) throw new Error('The editor must remain a native page.');
const destination = path.resolve(root, 'dist');
if (destination !== path.join(root, 'dist') || path.relative(root, destination) !== 'dist')
  throw new Error('Invalid build output directory.');
try {
  if ((await lstat(destination)).isSymbolicLink())
    throw new Error('Build output must not be a symlink.');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const name of ['index.html', 'components.html', 'src', 'assets', 'docs'])
  await cp(path.join(root, name), path.join(destination, name), { recursive: true });
await writeFile(path.join(destination, '.nojekyll'), '');
console.log('Static build verified in dist/. No runtime dependencies, iframe, or patch scripts.');
