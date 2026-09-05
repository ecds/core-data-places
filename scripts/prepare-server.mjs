import fs from 'node:fs';
import { copyComponents } from './build.components.mjs';

/**
 * Prebuild for the multi-tenant server (`npm run build:server`).
 *
 * `scripts/build.mjs` prepares a single static site: it fetches one atlas's
 * config.json, its descriptors and its content repo, and writes the TinaCMS
 * label files from them. The shared server resolves every atlas at request
 * time instead, so none of that applies — but `src/i18n/utils.ts` still
 * imports the generated label files and `Hits.tsx` the project components.
 * This writes the empty defaults for both.
 */
const EMPTY = ['./src/i18n/search.json', './src/i18n/userDefinedFields.json'];

for (const path of EMPTY) {
  if (!fs.existsSync(path)) {
    fs.writeFileSync(path, '{}\n', 'utf8');
  }
}

// A clean checkout has no content/ (the static site's content repo).
fs.mkdirSync('./content/components', { recursive: true });
copyComponents();
