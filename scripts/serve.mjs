import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The renderer's server: Astro's standalone Node handler, plus the
 * Brotli/gzip copies scripts/precompress.mjs wrote for the built assets
 * (the adapter itself sends everything uncompressed). An asset request from
 * a browser that accepts br or gzip gets the precompressed file, with the
 * same long-lived caching Astro gives hashed assets; everything else (pages,
 * API routes, other files) goes to Astro unchanged. A proxy in front can
 * still compress pages; this makes the big scripts small without one.
 *
 *   HOST=0.0.0.0 PORT=4321 node scripts/serve.mjs
 */
process.env.ASTRO_NODE_AUTOSTART = 'disabled';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.resolve(here, '../dist/client');
const { handler } = await import(path.resolve(here, '../dist/server/entry.mjs'));

const TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.wasm': 'application/wasm'
};

const ENCODINGS = [['br', '.br'], ['gzip', '.gz']];

const precompressed = (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return null;
  }

  const { pathname } = new URL(req.url, 'http://localhost');
  const type = TYPES[path.extname(pathname)];
  if (!type || !pathname.startsWith('/_astro/')) {
    return null;
  }

  const file = path.resolve(CLIENT, `.${decodeURIComponent(pathname)}`);
  if (!file.startsWith(`${CLIENT}${path.sep}`)) {
    return null;
  }

  const accepted = String(req.headers['accept-encoding'] || '');
  for (const [encoding, suffix] of ENCODINGS) {
    if (accepted.includes(encoding) && fs.existsSync(file + suffix)) {
      return { file: file + suffix, encoding, type };
    }
  }

  return null;
};

const server = http.createServer((req, res) => {
  const asset = precompressed(req);

  if (!asset) {
    handler(req, res);
    return;
  }

  const { size } = fs.statSync(asset.file);
  res.writeHead(200, {
    'Content-Type': asset.type,
    'Content-Encoding': asset.encoding,
    'Content-Length': size,
    Vary: 'Accept-Encoding',
    // /_astro/ files are content-hashed.
    'Cache-Control': 'public, max-age=31536000, immutable'
  });

  if (req.method === 'HEAD') {
    res.end();
  } else {
    fs.createReadStream(asset.file).pipe(res);
  }
});

const port = Number(process.env.PORT || 4321);
const host = process.env.HOST || 'localhost';

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`renderer listening on http://${host.includes(':') ? `[${host}]` : host}:${port}`);
});
