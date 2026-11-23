/**
 * A record page's address, `/<lang>/<model>/<slug or UUID>`. Safe to use in
 * the browser; the slug lookups are in @utils/recordAddress (server only).
 */
export const recordPath = (lang: string, model: string, record: { uuid: string, slug?: string | null }) => (
  `/${lang}/${model}/${encodeURIComponent(record.slug || record.uuid)}`
);
