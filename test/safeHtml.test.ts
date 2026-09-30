import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SafeHtml from '../src/components/SafeHtml';
import { isSafeUrl } from '../src/utils/htmlPolicy';

const render = (html: string) => renderToStaticMarkup(createElement(SafeHtml, { html }))
  .replace(/^<div>|<\/div>$/g, '');

describe('SafeHtml', () => {
  it('keeps formatting, lists, tables and safe links', () => {
    expect(render('<p>Built in <strong>1911</strong>, <em>rebuilt</em> 1925.</p><ul><li>One</li></ul>'))
      .toBe('<p>Built in <strong>1911</strong>, <em>rebuilt</em> 1925.</p><ul><li>One</li></ul>');
    expect(render('<table><tbody><tr><td colspan="2">x</td></tr></tbody></table>'))
      .toBe('<table><tbody><tr><td colSpan="2">x</td></tr></tbody></table>');
    expect(render('<a href="/en/places/abc">site</a>')).toBe('<a href="/en/places/abc">site</a>');
    expect(render('<a href="https://example.org" target="_self">out</a>'))
      .toBe('<a href="https://example.org" target="_blank" rel="noopener noreferrer">out</a>');
  });

  it('drops scripts, styles and embeds with their contents', () => {
    expect(render('<p>a</p><script>alert(1)</script><style>p{}</style><iframe src="https://evil.example"></iframe><svg><script>alert(2)</script></svg><p>b</p>'))
      .toBe('<p>a</p><p>b</p>');
  });

  it('drops event handlers, styles and unknown attributes', () => {
    expect(render('<p onclick="alert(1)" style="color:red" class="x" data-x="1">t</p><img src="https://example.org/a.png" onerror="alert(1)" alt="A">'))
      .toBe('<p>t</p><img src="https://example.org/a.png" alt="A" loading="lazy"/>');
  });

  it('drops unsafe link and image addresses, however they are written', () => {
    for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', ' javascript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', '//evil.example', '/\\evil.example']) {
      expect(render(`<a href="${href.replace(/"/g, '&quot;')}">x</a>`)).toBe('<a>x</a>');
    }
    expect(render('<img src="data:image/png;base64,AAAA" alt="x">')).toBe('<img alt="x" loading="lazy"/>');
    expect(render('<img src="mailto:x@example.org" alt="x">')).toBe('<img alt="x" loading="lazy"/>');
  });

  it('unwraps tags outside the list but keeps their text', () => {
    expect(render('<section><font color="red">kept</font></section>')).toBe('kept');
  });

  it('escapes text and drops comments', () => {
    expect(render('<p>&lt;script&gt;alert(1)&lt;/script&gt;<!-- secret --></p>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('renders nothing for no value', () => {
    expect(render('')).toBe('');
  });
});

describe('isSafeUrl', () => {
  it('allows site paths, anchors, http(s) and mailto for links', () => {
    for (const url of ['/en/pages/about', '#top', 'places/x', 'https://example.org', 'http://example.org', 'mailto:a@example.org']) {
      expect(isSafeUrl(url, 'a')).toBe(true);
    }
  });

  it('allows only http(s) and site paths for images', () => {
    expect(isSafeUrl('https://example.org/a.png', 'img')).toBe(true);
    expect(isSafeUrl('/core_data/public/v1/assets/k/a.png', 'img')).toBe(true);
    expect(isSafeUrl('mailto:a@example.org', 'img')).toBe(false);
    expect(isSafeUrl('data:image/png;base64,AAAA', 'img')).toBe(false);
  });
});
