/**
 * The atlas's two branding fonts (header and body, chosen in the console
 * from the engine's BRANDING_FONTS), as one Google Fonts stylesheet and the
 * CSS family each is set with. Loading only those two, from a <link> in the
 * page head with preconnect hints, replaces an @import of all eight inside
 * the main stylesheet (a request chain that blocked the first paint).
 */
interface BrandFont {
  // Google Fonts css2 `family=` value.
  spec: string;
  // The CSS font-family stack.
  css: string;
}

const FONTS: Record<string, BrandFont> = {
  Afacad: { spec: 'Afacad:ital,wght@0,400..700;1,400..700', css: "'Afacad', sans-serif" },
  Baskervville: { spec: 'Baskervville:ital,wght@0,400..700;1,400..700', css: "'Baskervville', serif" },
  // Google has no "Crimson Text SemiBold" family (the request failed, so it
  // never loaded): it's Crimson Text at weight 600.
  'Crimson Text SemiBold': { spec: 'Crimson+Text:ital,wght@0,600;1,600', css: "'Crimson Text', serif" },
  'DM Sans': { spec: 'DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000', css: "'DM Sans', sans-serif" },
  'DM Serif Display': { spec: 'DM+Serif+Display:ital@0;1', css: "'DM Serif Display', serif" },
  Inter: { spec: 'Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900', css: "'Inter', sans-serif" },
  'Libre Bodoni': { spec: 'Libre+Bodoni:ital,wght@0,400..700;1,400..700', css: "'Libre Bodoni', serif" },
  'Open Sans': { spec: 'Open+Sans:ital,wght@0,300..800;1,300..800', css: "'Open Sans', sans-serif" }
};

const DEFAULT_FONT = 'Inter';

const fontFor = (name?: string | null): BrandFont => FONTS[name || ''] || FONTS[DEFAULT_FONT];

/**
 * The CSS font-family for a branding font name (Inter when unknown).
 */
export const fontFamily = (name?: string | null): string => fontFor(name).css;

/**
 * One stylesheet URL for the fonts in use.
 */
export const fontsHref = (...names: Array<string | null | undefined>): string => {
  const specs = [...new Set(names.map((name) => fontFor(name).spec))];
  return `https://fonts.googleapis.com/css2?${specs.map((spec) => `family=${spec}`).join('&')}&display=swap`;
};
