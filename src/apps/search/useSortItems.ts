import { useContext, useMemo } from 'react';
import { useSortBy } from 'react-instantsearch';
import TranslationContext from '@contexts/TranslationContext';
import { useSearchConfig } from '@apps/search/SearchConfigContext';
import { toSortKey } from '@search/elasticsearch/settings';

export interface SortItem {
  label: string;
  value: string;
}

/**
 * The sorts a search offers, as InstantSearch sortBy items. InstantSearch
 * expresses a sort as a target "index"; Searchkit resolves
 * `<index>_sort_<name>` to the named sort declared in the server-side search
 * settings (see `settings.ts`), and the bare index name is relevance.
 *
 * Relevance, A–Z and Z–A always; then the atlas's own sorts, which include
 * Oldest/Newest first when the search has dates (`dates.ts`). Shared by the
 * list/grid layouts and the map layout, so both offer the same names and
 * write the same `?sort=` (routing.ts).
 */
const useSortItems = (): SortItem[] => {
  const { t } = useContext(TranslationContext);
  const config = useSearchConfig();

  const indexName = config.elasticsearch.index_name;

  return useMemo(() => [{
    label: t('relevance'),
    value: indexName
  }, {
    label: t('A-Z'),
    value: `${indexName}${toSortKey('name_asc')}`
  }, {
    label: t('Z-A'),
    value: `${indexName}${toSortKey('name_desc')}`
  }, ...(config.elasticsearch.sort_attributes || []).map((sort) => ({
    label: t(sort.name) || sort.name,
    value: `${indexName}${toSortKey(sort.name)}`
  }))], [t, indexName, config.elasticsearch.sort_attributes]);
};

/**
 * The sort widget: the items, the current one and `refine`.
 *
 * The widget is registered with the items' values only. Its props are
 * compared by value, and the translated labels arrive after the first render
 * (useTranslations loads them): registering with labels re-created the widget
 * when they changed, and disposing a sortBy widget resets the search to
 * relevance — so a `?sort=` link was dropped on load.
 */
export const useSort = () => {
  const items = useSortItems();
  const values = useMemo(() => items.map((item) => item.value), [items]);
  const key = values.join('\n');

  const widgetItems = useMemo(() => values.map((value) => ({ label: value, value })), [key]);
  const { currentRefinement, refine } = useSortBy({ items: widgetItems });

  const current = useMemo(
    () => items.find((item) => item.value === currentRefinement),
    [currentRefinement, items]
  );

  return { current, currentRefinement, items, refine };
};

export default useSortItems;
