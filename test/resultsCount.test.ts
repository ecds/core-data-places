import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ResultsCount from '../src/apps/search/map/ResultsCount';
import TranslationContext from '../src/contexts/TranslationContext';
import i18n from '../src/i18n/i18n.json';

// The default wording, interpolated the way an atlas's translations are.
const t = (key: string, values: { [key: string]: string | number } = {}) => (
  (i18n as any)[key].defaultValue.replace(/\{\{(\w+)\}\}/g, (_match: string, name: string) => String(values[name]))
);

const render = (count: number) => renderToStaticMarkup(
  createElement(TranslationContext.Provider, { value: { lang: 'en', t } }, createElement(ResultsCount, { count }))
);

describe('ResultsCount', () => {
  it('shows the total it is given, not a count of loaded hits', () => {
    expect(render(154)).toBe('<p class="text-sm italic">154 results</p>');
  });

  it('formats a large total', () => {
    expect(render(5321)).toContain('>5,321 results<');
  });

  it('uses the singular for one result', () => {
    expect(render(1)).toContain('>1 result<');
  });

  it('says 0 results when there are none', () => {
    expect(render(0)).toContain('>0 results<');
  });
});
