import { describe, expect, it } from 'vitest';
import { markdownToHtml, sanitizeHtml } from '../src/utils/html';
import {
  findImage,
  imageAttributes,
  imageUrlAtHeight,
  imageUrlAtWidth,
  type AtlasImages
} from '../src/utils/images';

const BASE = 'https://console.example.org';
const PHOTO = '/core_data/public/v1/assets/photokey/street%20scene.jpg';
const LOGO = '/core_data/public/v1/assets/logokey/logo.png';
const SVG = '/core_data/public/v1/assets/svgkey/mark.svg';

const copy = (key: string, width: number, height: number, name = 'street-scene') => ({
  path: `/core_data/public/v1/assets/${key}/${name}-${width}.jpg`,
  width,
  height
});

const images: AtlasImages = {
  photokey: {
    width: 6000,
    height: 4000,
    variants: [
      copy('c160', 160, 107),
      copy('c320', 320, 213),
      copy('c640', 640, 427),
      copy('c1024', 1024, 683),
      copy('c1440', 1440, 960),
      copy('c2000', 2000, 1333)
    ]
  },
  // A 600 x 200 logo: copies below its width, then the original itself.
  logokey: {
    width: 600,
    height: 200,
    variants: [
      copy('l160', 160, 53, 'logo'),
      copy('l320', 320, 107, 'logo'),
      { path: LOGO, width: 600, height: 200 }
    ]
  },
  // An animated image: size known, no copies.
  animkey: { width: 400, height: 300, variants: [] }
};

const options = { assetBase: BASE, images };

describe('findImage', () => {
  it('finds an upload by its stored path or its absolute address', () => {
    expect(findImage(PHOTO, options)?.width).toBe(6000);
    expect(findImage(`${BASE}${PHOTO}`, options)?.width).toBe(6000);
  });

  it('knows nothing about other images', () => {
    expect(findImage(SVG, options)).toBeUndefined();
    expect(findImage('https://elsewhere.example.org/photo.jpg', options)).toBeUndefined();
    expect(findImage(PHOTO, { assetBase: BASE })).toBeUndefined();
  });
});

describe('imageAttributes', () => {
  it('offers the copies as a srcset, sized by the largest', () => {
    const attributes = imageAttributes(PHOTO, '100vw', options)!;

    expect(attributes.srcset).toBe([160, 320, 640, 1024, 1440, 2000]
      .map((w) => `${BASE}/core_data/public/v1/assets/c${w}/street-scene-${w}.jpg ${w}w`)
      .join(', '));
    expect(attributes.sizes).toBe('100vw');
    expect(attributes.src).toBe(`${BASE}/core_data/public/v1/assets/c1024/street-scene-1024.jpg`);
    expect([attributes.width, attributes.height]).toEqual([2000, 1333]);
  });

  it('uses the largest copy as src when none reaches 1024 px', () => {
    expect(imageAttributes(LOGO, '200px', options)!.src).toBe(`${BASE}${LOGO}`);
  });

  it('shows anything without copies as it is', () => {
    expect(imageAttributes(SVG, '100vw', options)).toEqual({ src: `${BASE}${SVG}`, width: undefined, height: undefined });
    expect(imageAttributes('/core_data/public/v1/assets/animkey/a.webp', '100vw', options))
      .toEqual({ src: `${BASE}/core_data/public/v1/assets/animkey/a.webp`, width: 400, height: 300 });
    expect(imageAttributes('https://elsewhere.example.org/a.jpg', '100vw', options)).toEqual({ src: 'https://elsewhere.example.org/a.jpg' });
    expect(imageAttributes(PHOTO, '100vw', { assetBase: BASE })).toEqual({ src: `${BASE}${PHOTO}` });
    expect(imageAttributes(undefined, '100vw', options)).toBeUndefined();
  });
});

describe('single URLs', () => {
  it('picks the narrowest copy at least as wide as asked', () => {
    expect(imageUrlAtWidth(PHOTO, 1200, options)).toBe(`${BASE}/core_data/public/v1/assets/c1440/street-scene-1440.jpg`);
    expect(imageUrlAtWidth(PHOTO, 64, options)).toBe(`${BASE}/core_data/public/v1/assets/c160/street-scene-160.jpg`);
    expect(imageUrlAtWidth(PHOTO, 5000, options)).toBe(`${BASE}/core_data/public/v1/assets/c2000/street-scene-2000.jpg`);
    expect(imageUrlAtWidth(SVG, 64, options)).toBe(`${BASE}${SVG}`);
  });

  it('sizes a logo for a 2x screen at its height', () => {
    // 48 px tall at 3:1 is 144 px wide; 288 px on a 2x screen.
    expect(imageUrlAtHeight(LOGO, 48, options)).toBe(`${BASE}/core_data/public/v1/assets/l320/logo-320.jpg`);
    // 100 px tall is 300 px wide; 600 px at 2x: the original.
    expect(imageUrlAtHeight(LOGO, 100, options)).toBe(`${BASE}${LOGO}`);
    expect(imageUrlAtHeight(SVG, 48, options)).toBe(`${BASE}${SVG}`);
  });
});

describe('images in page text', () => {
  it('gives an uploaded image its copies and size', () => {
    const html = markdownToHtml(`![A street](${PHOTO})`, options);

    expect(html).toContain(`src="${BASE}/core_data/public/v1/assets/c1024/street-scene-1024.jpg"`);
    expect(html).toContain(`srcset="${BASE}/core_data/public/v1/assets/c160/street-scene-160.jpg 160w,`);
    expect(html).toContain('sizes="(min-width: 1536px) 1280px, 100vw"');
    expect(html).toContain('width="2000"');
    expect(html).toContain('height="1333"');
    expect(html).toContain('loading="lazy"');
  });

  it('leaves other images as they are', () => {
    const html = markdownToHtml('![Elsewhere](https://elsewhere.example.org/a.jpg)', options);

    expect(html).toBe('<p><img src="https://elsewhere.example.org/a.jpg" alt="Elsewhere" loading="lazy" /></p>');
  });

  it('drops a srcset written into the markup', () => {
    const html = sanitizeHtml('<img src="https://example.org/a.jpg" srcset="javascript:alert(1) 1x, https://evil.example/b.jpg 2x" sizes="100vw">', options);

    expect(html).not.toContain('srcset');
    expect(html).not.toContain('sizes');
    expect(html).not.toContain('evil');
  });

  it('replaces a written srcset on an uploaded image with its own', () => {
    const html = sanitizeHtml(`<img src="${PHOTO}" srcset="https://evil.example/b.jpg 2x">`, options);

    expect(html).not.toContain('evil');
    expect(html).toContain('c2000/street-scene-2000.jpg 2000w');
  });
});
