import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LinkedText from '../src/components/LinkedText';

const render = (value: string | null) => renderToStaticMarkup(createElement(LinkedText, { value }));
describe('LinkedText', () => {
  it('shows a value that is only a URL as a short link', () => {
    expect(render('https://catalog.archives.gov/id/93208232')).toBe(
      '<a class="underline underline-offset-2 break-all" href="https://catalog.archives.gov/id/93208232" '
        + 'rel="noopener noreferrer" target="_blank">catalog.archives.gov/id/93208232</a>'
    );
  });

  it('links URLs inside text and leaves trailing punctuation outside', () => {
    const html = render('See https://example.org/a. Or http://www.example.org/b), thanks');

    expect(html).toContain('See <a');
    expect(html).toContain('href="https://example.org/a"');
    expect(html).toContain('>https://example.org/a</a>. Or <a');
    expect(html).toContain('href="http://www.example.org/b"');
    expect(html).toContain('</a>), thanks');
  });

  it('shortens a long URL shown on its own', () => {
    const html = render(`https://example.org/${'x'.repeat(100)}`);

    expect(html).toContain('…</a>');
    expect(html).toContain(`href="https://example.org/${'x'.repeat(100)}"`);
  });

  it('never links other schemes and escapes text', () => {
    const html = render('javascript:alert(1) <b>bold</b> ftp://example.org');

    expect(html).not.toContain('<a');
    expect(html).toBe('javascript:alert(1) &lt;b&gt;bold&lt;/b&gt; ftp://example.org');
  });

  it('renders plain text and nothing for no value', () => {
    expect(render('355 Peachtree St.')).toBe('355 Peachtree St.');
    expect(render(null)).toBe('');
  });
});
