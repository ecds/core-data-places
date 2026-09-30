import { describe, expect, it } from 'vitest';
import { markdownToHtml, resolveAssetPath, sanitizeHtml } from '../src/utils/html';

const ASSET = '/core_data/public/v1/assets/abc123/logo.png';
const BASE = 'https://console.example.org';

describe('markdownToHtml', () => {
  it('renders Markdown, including GitHub tables and autolinks', () => {
    const html = markdownToHtml('## Heading\n\nSome **bold** and *italic* text, see https://example.org.\n\n| a | b |\n|---|---|\n| 1 | 2 |');

    expect(html).toContain('<h2>Heading</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<a href="https://example.org" target="_blank" rel="noopener noreferrer">https://example.org</a>');
    expect(html).toContain('<td>1</td>');
  });

  it('escapes raw HTML instead of passing it through', () => {
    const html = markdownToHtml('Hello <script>alert(1)</script> <img src=x onerror=alert(1)>');

    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('drops javascript: and data: links', () => {
    const html = markdownToHtml('[click](javascript:alert(1)) [data](data:text/html,<b>x</b>)');

    expect(html).not.toMatch(/href="(javascript|data):/i);
    expect(html).toContain('click');
  });

  it('keeps site links in the same tab', () => {
    expect(markdownToHtml('[the map](/en/search/places)')).toBe('<p><a href="/en/search/places">the map</a></p>');
  });

  it('points uploaded images at the console', () => {
    const html = markdownToHtml(`![Logo](${ASSET})`, { assetBase: `${BASE}/` });

    expect(html).toContain(`src="${BASE}${ASSET}"`);
    expect(html).toContain('alt="Logo"');
    expect(html).toContain('loading="lazy"');
  });

  it('is empty for no text', () => {
    expect(markdownToHtml(undefined)).toBe('');
    expect(markdownToHtml('')).toBe('');
  });
});

describe('sanitizeHtml', () => {
  it('strips script, event handlers, iframes and styles', () => {
    const html = sanitizeHtml('<p onclick="x()">Hi<script>alert(1)</script></p><iframe src="https://evil.example"></iframe><style>body{display:none}</style><img src="https://example.org/a.png" onerror="alert(1)">');

    expect(html).toBe('<p>Hi</p><img src="https://example.org/a.png" loading="lazy" />');
  });

  it('refuses javascript: links and data: images', () => {
    const html = sanitizeHtml('<a href="javascript:alert(1)">x</a><a href="JaVaScRiPt:alert(1)">y</a><img src="data:image/png;base64,AAAA">');

    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toContain('data:');
  });

  it('refuses protocol-relative links', () => {
    expect(sanitizeHtml('<a href="//evil.example/x">x</a>')).toBe('<a>x</a>');
  });

  it('opens external links in a new tab without opener access, and drops a site link\'s target', () => {
    expect(sanitizeHtml('<a href="https://example.org">x</a>')).toBe('<a href="https://example.org" target="_blank" rel="noopener noreferrer">x</a>');
    expect(sanitizeHtml('<a href="/en/pages/about" target="_blank">x</a>')).toBe('<a href="/en/pages/about">x</a>');
  });

  it('keeps WordPress-style formatting', () => {
    const html = '<figure><img src="https://example.org/a.jpg" alt="A" /><figcaption>Caption</figcaption></figure><blockquote><p>Quote</p></blockquote>';

    expect(sanitizeHtml(html)).toBe('<figure><img src="https://example.org/a.jpg" alt="A" loading="lazy" /><figcaption>Caption</figcaption></figure><blockquote><p>Quote</p></blockquote>');
  });
});

describe('resolveAssetPath', () => {
  it('prefixes console paths with the console URL', () => {
    expect(resolveAssetPath(ASSET, BASE)).toBe(`${BASE}${ASSET}`);
    expect(resolveAssetPath(ASSET, `${BASE}//`)).toBe(`${BASE}${ASSET}`);
  });

  it('leaves other sources alone', () => {
    expect(resolveAssetPath('https://example.org/a.png', BASE)).toBe('https://example.org/a.png');
    expect(resolveAssetPath('/favicon.svg', BASE)).toBe('/favicon.svg');
    expect(resolveAssetPath(ASSET, '')).toBe(ASSET);
    expect(resolveAssetPath(undefined, BASE)).toBeUndefined();
  });
});
