/**
 * Builds the map icon sprite, `public/sprites/og.{json,png}` and `og@2x`,
 * from the single-colour SVGs in `icons/`. The sprite is SDF, so a style
 * recolours an icon with `icon-color`; maps load it as a second sprite named
 * "og" (icons are `og:church`, …) next to the base map's own.
 *
 * Every icon must be listed in `icons/MANIFEST.json` with its source and
 * licence, since the sprite is published with every atlas; the credits and
 * licence texts (`icons/ATTRIBUTION.md`, `icons/licenses/`) are published
 * next to it.
 *
 * Requires spreet (https://github.com/flother/spreet) on the PATH:
 * `cargo install spreet`. The built files are committed, so building the
 * site doesn't need it.
 *
 * Usage: npm run build:sprites
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const iconsDir = path.join(root, 'icons');
const outDir = path.join(root, 'public', 'sprites');

const manifest = JSON.parse(fs.readFileSync(path.join(iconsDir, 'MANIFEST.json'), 'utf8'));
const icons = fs.readdirSync(iconsDir).filter((file) => file.endsWith('.svg')).map((file) => file.replace(/\.svg$/, ''));
const unlisted = icons.filter((icon) => !manifest.icons?.[icon]?.source || !manifest.icons?.[icon]?.license);

if (unlisted.length) {
  console.error(`Not in icons/MANIFEST.json with a source and licence: ${unlisted.join(', ')}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const spreet = (args) => execFileSync('spreet', args, { stdio: 'inherit' });

spreet(['--sdf', iconsDir, path.join(outDir, 'og')]);
spreet(['--sdf', '--retina', iconsDir, path.join(outDir, 'og@2x')]);

// The credits and licence texts the icons' licences require go out with it.
fs.copyFileSync(path.join(iconsDir, 'ATTRIBUTION.md'), path.join(outDir, 'ATTRIBUTION.md'));
fs.cpSync(path.join(iconsDir, 'licenses'), path.join(outDir, 'licenses'), { recursive: true });

console.log(`Built public/sprites/og from ${icons.length} icons: ${icons.join(', ')}`);
