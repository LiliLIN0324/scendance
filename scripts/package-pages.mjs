import { cp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('frontend/out/', root);
const showcase = new URL('showcase/', output);
await mkdir(new URL('assets/', showcase), { recursive: true });
for (const path of ['assets/catalogue.json', 'assets/models', 'assets/venue.jpg', 'vendor', 'renderer-webgl.js', 'asset-catalogue.js']) {
  await cp(new URL(path, root), new URL(path, showcase), { recursive: true });
}
const introduction = (await readFile(new URL('index.html', root), 'utf8'))
  .replaceAll('http://localhost:3000/', '/')
  .replaceAll('./assets/', '/showcase/assets/')
  .replaceAll('./vendor/', '/showcase/vendor/')
  .replaceAll('./renderer-webgl.js', '/showcase/renderer-webgl.js')
  .replaceAll('./asset-catalogue.js', '/showcase/asset-catalogue.js')
  .replaceAll('./${a.localPath}', '/showcase/${a.localPath}');
await writeFile(new URL('introduction.html', output), introduction);
console.log(`Packaged editor and /introduction in ${fileURLToPath(output)}`);
