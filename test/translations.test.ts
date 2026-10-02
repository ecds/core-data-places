import { describe, expect, test } from 'vitest';
import { getAtlasContent, getAtlasLocales, getAtlasNavigation, getAtlasPage, localizeHref, runWithAtlas } from '../src/atlas/server';
import type { AtlasBundle } from '../src/atlas/types';

const bundle = (overrides: Partial<AtlasBundle> = {}): AtlasBundle => ({
  slug: 'test',
  config: { i18n: { default_locale: 'en', locales: ['en', 'es'] } },
  branding: {},
  navigation: { items: [{ label: 'Explore', href: '/en/search/places' }] },
  navigations: {
    en: { items: [{ label: 'Explore', href: '/en/search/places' }] },
    es: { items: [{ label: 'Explorar', href: '/es/search/places' }] }
  },
  content: {
    home: { sections: [{ type: 'hero', title: 'Welcome', button_url: '/en/search/places' }] },
    pages: [
      { slug: 'about', title: 'About', sections: [{ type: 'text', body: 'See [the map](/en/search/places) or [credits](/en/pages/credits).' }] },
      { slug: 'credits', title: 'Credits', sections: [{ type: 'call_to_action', button_url: 'https://example.org/en/x' }] }
    ],
    translations: {
      es: {
        home: { sections: [{ type: 'hero', title: 'Bienvenidos', button_url: '/en/search/places' }] },
        pages: [{ slug: 'about', title: 'Acerca de', sections: [] }]
      },
      fr: { pages: [{ slug: 'about', title: 'À propos', sections: [] }] }
    }
  },
  ...overrides
});

describe('an atlas in several languages', () => {
  test('the default language gets the pages as written', () => runWithAtlas(bundle(), () => {
    const content = getAtlasContent('en');

    expect(content.home?.sections[0].title).toBe('Welcome');
    expect(content.pages.map((page) => page.title)).toEqual(['About', 'Credits']);
    expect(content.home?.sections[0].button_url).toBe('/en/search/places');
  }));

  test('another language gets its translations, the rest in the default language', () => runWithAtlas(bundle(), () => {
    const content = getAtlasContent('es');

    expect(content.home?.sections[0].title).toBe('Bienvenidos');
    expect(content.pages.map((page) => page.title)).toEqual(['Acerca de', 'Credits']);
    expect(getAtlasPage('about', 'es')?.title).toBe('Acerca de');
    expect(getAtlasPage('credits', 'es')?.title).toBe('Credits');
  }));

  test('site links in it point at pages in that language; other links are left alone', () => runWithAtlas(bundle(), () => {
    const content = getAtlasContent('es');

    expect(content.home?.sections[0].button_url).toBe('/es/search/places');
    expect(getAtlasPage('credits', 'es')?.sections[0].button_url).toBe('https://example.org/en/x');

    const untranslated = runWithAtlas(bundle({ content: { ...bundle().content!, translations: null } }), () => getAtlasPage('about', 'es'));
    expect(untranslated?.sections[0].body).toBe('See [the map](/es/search/places) or [credits](/es/pages/credits).');
  }));

  test('a language the atlas isn\'t in gets the default content, even when translated', () => runWithAtlas(bundle(), () => {
    expect(getAtlasLocales()).toEqual(['en', 'es']);
    expect(getAtlasContent('fr').pages[0].title).toBe('About');
  }));

  test('the menu comes in the page\'s language, else the default one', () => runWithAtlas(bundle(), () => {
    expect(getAtlasNavigation('es').items[0].label).toBe('Explorar');
    expect(getAtlasNavigation('de').items[0].label).toBe('Explore');
    expect(getAtlasNavigation().items[0].label).toBe('Explore');
  }));

  test('localizeHref', () => {
    expect(localizeHref('/en/pages/about', 'en', 'es')).toBe('/es/pages/about');
    expect(localizeHref('/en', 'en', 'es')).toBe('/es');
    expect(localizeHref('/en?q=x', 'en', 'es')).toBe('/es?q=x');
    expect(localizeHref('/english/x', 'en', 'es')).toBe('/english/x');
    expect(localizeHref('https://x.org/en/a', 'en', 'es')).toBe('https://x.org/en/a');
    expect(localizeHref(undefined, 'en', 'es')).toBeUndefined();
  });
});
