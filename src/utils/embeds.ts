import { parameterize } from './exclusions';

/**
 * A 360° view, virtual tour or video shown on a record's page from one of
 * its own fields: the atlas config names the field,
 *
 *   detail_pages.models.<model>.embed_field: '360_view'
 *
 * (a field uuid, its label, or its parameterized name, as photo_field), and
 * the field's value is a link from one of the hosts below. Only those are
 * embedded — each one's own player, in a sandboxed frame — so a value can't
 * frame an arbitrary site. (The Georgia Coast Atlas embeds its panoramas
 * the same way, from an "embed URL".)
 */

export type EmbedKind = 'panorama' | 'tour' | 'video' | 'map';

export interface Embed {
  /** The player's address, for the frame. */
  src: string;
  kind: EmbedKind;
  /** The host's name, for "Open on …". */
  provider: string;
  /** The link as stored, to open it on the host. */
  url: string;
}

type Rule = { provider: string, kind: EmbedKind, test: (u: URL) => string | null };

const host = (u: URL) => u.hostname.replace(/^www\./, '');
const id = (value: string | null | undefined, pattern = /^[\w-]+$/) => (value && pattern.test(value) ? value : null);

const RULES: Rule[] = [
  { provider: 'Kuula', kind: 'panorama', test: (u) => (host(u) === 'kuula.co' && /^\/share\//.test(u.pathname) ? `https://kuula.co${u.pathname}${u.search}` : null) },
  { provider: 'Momento360', kind: 'panorama', test: (u) => (host(u) === 'momento360.com' && /^\/e\/u\/[\w-]+/.test(u.pathname) ? `https://momento360.com${u.pathname}${u.search}` : null) },
  { provider: 'Panoee', kind: 'tour', test: (u) => (host(u) === 'panoee.com' && /^\/[\w-]+\/?$/.test(u.pathname) ? `https://panoee.com${u.pathname}` : null) },
  {
    provider: 'Roundme',
    kind: 'tour',
    test: (u) => {
      const m = host(u) === 'roundme.com' && u.pathname.match(/^\/(?:tour|embed)\/(\d+)(?:\/(?:view\/)?(\d+))?/);
      return m ? `https://roundme.com/embed/${m[1]}${m[2] ? `/${m[2]}` : ''}` : null;
    }
  },
  { provider: 'Matterport', kind: 'tour', test: (u) => (host(u) === 'my.matterport.com' && u.pathname === '/show/' && id(u.searchParams.get('m')) ? `https://my.matterport.com/show/?m=${u.searchParams.get('m')}` : null) },
  {
    provider: 'YouTube',
    kind: 'video',
    test: (u) => {
      const h = host(u);
      const video = (h === 'youtu.be' && id(u.pathname.slice(1)))
        || ((h === 'youtube.com' || h === 'm.youtube.com') && (id(u.searchParams.get('v')) || id(u.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/)?.[1])))
        || (h === 'youtube-nocookie.com' && id(u.pathname.match(/^\/embed\/([\w-]+)/)?.[1]));
      return video ? `https://www.youtube-nocookie.com/embed/${video}` : null;
    }
  },
  {
    provider: 'Vimeo',
    kind: 'video',
    test: (u) => {
      const h = host(u);
      const video = (h === 'vimeo.com' && id(u.pathname.match(/^\/(\d+)\/?$/)?.[1])) || (h === 'player.vimeo.com' && id(u.pathname.match(/^\/video\/(\d+)/)?.[1]));
      return video ? `https://player.vimeo.com/video/${video}` : null;
    }
  },
  { provider: 'Google Maps', kind: 'map', test: (u) => (host(u) === 'google.com' && u.pathname === '/maps/embed' && u.searchParams.get('pb') ? `https://www.google.com/maps/embed?pb=${encodeURIComponent(u.searchParams.get('pb') as string)}` : null) }
];

/**
 * The embed for a link, or null when it isn't an https link to a known host.
 */
export const toEmbed = (value: string | null | undefined): Embed | null => {
  const text = (value || '').trim();
  if (!/^https:\/\//i.test(text)) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch (error) {
    return null;
  }

  if (url.username || url.password || (url.port && url.port !== '443')) return null;

  for (const rule of RULES) {
    const src = rule.test(url);
    if (src) return { src, kind: rule.kind, provider: rule.provider, url: text };
  }

  return null;
};

export const getEmbedField = (config: any, model: string): string | null => (
  config?.detail_pages?.models?.[model]?.embed_field || null
);

/**
 * The record's embed from `field`, or null.
 */
export const getEmbed = (record: any, field: string | null | undefined): Embed | null => {
  if (!field || !record?.user_defined) return null;

  const key = parameterize(field);
  const entry = Object.entries(record.user_defined).find(([uuid, value]: [string, any]) => (
    uuid === field || value?.label === field || parameterize(value?.label) === key
  )) as [string, any] | undefined;

  return typeof entry?.[1]?.value === 'string' ? toEmbed(entry[1].value) : null;
};
