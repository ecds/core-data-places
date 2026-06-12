/**
 * Builds self-hosted PMTiles vector tiles from the cached Core Data geometry
 * collection (populated by the `geometry` Astro content loader on first build).
 *
 * Produces two tile layers:
 *   - `features`: the original geometries (points/polygons), with `uuid` + `name`
 *   - `labels`:   centroid points for symbol/label placement
 *
 * Output: public/tiles/<index_name>.pmtiles (per search config), servable from
 * any static host that supports HTTP range requests.
 *
 * Requires tippecanoe (https://github.com/felt/tippecanoe) on the PATH.
 *
 * Usage: node scripts/build.tiles.mjs [--out <file>] [-Z <minzoom>] [-z <maxzoom>]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unflatten } from 'devalue';

const DATA_STORE = '.astro/data-store.json';

const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const config = JSON.parse(fs.readFileSync('public/config.json', 'utf8'));
const indexName = config.search?.[0]?.typesense?.index_name || 'places';
const asDir = args.includes('--dir');
const outFile = argValue('--out', asDir ? `public/tiles/${indexName}` : `public/tiles/${indexName}.pmtiles`);
const minZoom = argValue('-Z', '6');
const maxZoom = argValue('-z', '15');

if (!fs.existsSync(DATA_STORE)) {
  console.error(`No ${DATA_STORE} found — run a build/dev first so the geometry loader populates it.`);
  process.exit(1);
}

const store = unflatten(JSON.parse(fs.readFileSync(DATA_STORE, 'utf8')));
const geometries = store.get('geometry');

if (!geometries?.size) {
  console.error('No `geometry` collection in the data store.');
  process.exit(1);
}

console.log(`Read ${geometries.size} geometries from ${DATA_STORE}`);

// Recursively averages all coordinate positions — adequate for label anchors.
const centroidOf = (coords, acc = { x: 0, y: 0, n: 0 }) => {
  if (!Array.isArray(coords) || !coords.length) {
    return acc;
  }
  if (typeof coords[0] === 'number') {
    acc.x += coords[0];
    acc.y += coords[1];
    acc.n += 1;
  } else {
    coords.forEach((c) => centroidOf(c, acc));
  }
  return acc;
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-tiles-'));
const featuresPath = path.join(tmpDir, 'features.geojsonl');
const labelsPath = path.join(tmpDir, 'labels.geojsonl');

const featuresOut = fs.createWriteStream(featuresPath);
const labelsOut = fs.createWriteStream(labelsPath);

let count = 0;

for (const entry of geometries.values()) {
  const { uuid, name, geometry } = entry.data;

  if (!geometry) {
    continue;
  }

  const geom = typeof geometry === 'string' ? JSON.parse(geometry) : geometry;

  if (!geom?.type || (!geom.coordinates && !geom.geometries)) {
    continue;
  }

  const properties = { uuid, name };

  featuresOut.write(`${JSON.stringify({ type: 'Feature', geometry: geom, properties })}\n`);

  const coords = geom.coordinates ?? geom.geometries?.map((g) => g.coordinates);
  const { x, y, n } = centroidOf(coords);

  if (n > 0) {
    labelsOut.write(`${JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [x / n, y / n] },
      properties
    })}\n`);
  }

  count += 1;
}

await Promise.all([
  new Promise((resolve) => featuresOut.end(resolve)),
  new Promise((resolve) => labelsOut.end(resolve))
]);

console.log(`Wrote ${count} features. Running tippecanoe...`);

fs.mkdirSync(path.dirname(outFile), { recursive: true });

if (asDir) {
  fs.rmSync(outFile, { recursive: true, force: true });
}

execFileSync('tippecanoe', [
  asDir ? '-e' : '-o', outFile,
  '--force',
  '--name', indexName,
  '-Z', minZoom,
  '-z', maxZoom,
  '--drop-densest-as-needed',
  '--extend-zooms-if-still-dropping',
  '--coalesce-densest-as-needed',
  // Static hosts won't set Content-Encoding: gzip for .pbf files.
  ...(asDir ? ['--no-tile-compression'] : []),
  '-L', `features:${featuresPath}`,
  '-L', `labels:${labelsPath}`
], { stdio: 'inherit' });

fs.rmSync(tmpDir, { recursive: true, force: true });

if (asDir) {
  console.log(`Done: ${outFile}/{z}/{x}/{y}.pbf`);
} else {
  const { size } = fs.statSync(outFile);
  console.log(`Done: ${outFile} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}
