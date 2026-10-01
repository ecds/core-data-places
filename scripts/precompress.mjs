import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Writes Brotli (.br) and gzip (.gz) copies of the built client assets, for
 * scripts/serve.mjs to send to browsers that accept them. The map page's
 * JavaScript is ~7 MB as built (MapLibre, the IIIF viewers); compressed it
 * is about a third of that. Run after `astro build` (npm run build:server).
 */
const ROOT = path.resolve('dist/client');
const TYPES = new Set(['.js', '.mjs', '.css', '.svg', '.json', '.html', '.txt', '.xml', '.wasm']);
const MIN_BYTES = 1024;

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});

let files = 0;
let before = 0;
let after = 0;

for (const file of walk(ROOT)) {
  if (!TYPES.has(path.extname(file))) {
    continue;
  }

  const data = fs.readFileSync(file);
  if (data.length < MIN_BYTES) {
    continue;
  }

  const br = zlib.brotliCompressSync(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length } });
  fs.writeFileSync(`${file}.br`, br);
  fs.writeFileSync(`${file}.gz`, zlib.gzipSync(data, { level: 9 }));

  files += 1;
  before += data.length;
  after += br.length;
}

// eslint-disable-next-line no-console
console.log(`precompress: ${files} files, ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB (brotli)`);
