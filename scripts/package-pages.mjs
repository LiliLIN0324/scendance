import { cp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('frontend/out/', root);
const showcase = new URL('showcase/', output);
await mkdir(showcase, { recursive: true });
for (const path of ['assets', 'vendor', 'renderer-webgl.js']) {
  await cp(new URL(path, root), new URL(path, showcase), { recursive: true });
}
const introduction = (await readFile(new URL('index.html', root), 'utf8'))
  .replaceAll('http://localhost:3000/', '/')
  .replaceAll('./assets/', '/showcase/assets/')
  .replaceAll('./vendor/', '/showcase/vendor/')
  .replaceAll('./renderer-webgl.js', '/showcase/renderer-webgl.js')
  .replaceAll('./${a.localPath}', '/showcase/${a.localPath}');
await writeFile(new URL('introduction.html', output), introduction);
console.log(`Packaged editor and /introduction in ${fileURLToPath(output)}`);
