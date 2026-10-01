import Facet, { useFacetLabel } from '@apps/search/Facet';
import TranslationContext from '@contexts/TranslationContext';
import { Checkbox, Icon } from '@performant-software/core-data';
import { useContext, useMemo, useState } from 'react';
import { useRefinementList } from 'react-instantsearch';
import _ from 'underscore';

interface Props {
  attribute: string,
  className?: string;
  icon?: string;
}

// Values shown before "show more".
const LIMIT = 5;

// Values loaded once the list is opened or searched. Long enough for a
// Library of Congress subject list (195 terms on the HABS rehearsal atlas);
// the aggregation is per facet and the payload small.
const SHOW_MORE_LIMIT = 500;

/**
 * Folds case and accents so "cafe" finds "Café".
 */
const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const ListFacet = ({ attribute, className, icon }: Props) => {
  const {
    canToggleShowMore,
    isShowingMore,
    items,
    refine,
    toggleShowMore
  } = useRefinementList({ attribute, limit: LIMIT, showMore: true, showMoreLimit: SHOW_MORE_LIMIT });

  const { t } = useContext(TranslationContext);
  const label = useFacetLabel(attribute);

  const [query, setQuery] = useState('');

  /**
   * A list too long to scan gets a search box. Typing loads the whole list
   * (show more) and narrows it to the values containing what was typed.
   */
  const searchable = canToggleShowMore || !!query;

  const visible = useMemo(() => {
    const needle = fold(query.trim());
    return needle ? _.filter(items, (item) => fold(item.label).includes(needle)) : items;
  }, [items, query]);

  const onQueryChange = (value: string) => {
    setQuery(value);

    if (value.trim() && !isShowingMore) {
      toggleShowMore();
    }
  };

  if (_.isEmpty(items)) {
    return null;
  }

  return (
    <Facet
      attribute={attribute}
      className={className}
      icon={icon}
    >
      { searchable && (
        <div
          className='flex items-center gap-1 mb-2 border border-neutral-300 rounded px-2 bg-white focus-within:border-neutral-500'
        >
          <Icon
            name='search'
            size={16}
          />
          <input
            aria-label={t('facetSearch', { label })}
            className='w-full py-1 text-sm bg-transparent outline-none normal-case'
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t('facetSearch', { label })}
            type='text'
            value={query}
          />
          { query && (
            <button
              aria-label={t('clearSearch')}
              className='flex items-center'
              onClick={() => setQuery('')}
              type='button'
            >
              <Icon
                name='close'
                size={16}
              />
            </button>
          )}
        </div>
      )}
      { query && _.isEmpty(visible) && (
        <p
          className='py-1 text-neutral-600'
        >
          { t('facetSearchNone', { query: query.trim() }) }
        </p>
      )}
      <ul
        className={query ? 'max-h-80 overflow-y-auto' : undefined}
      >
        { _.map(visible, (item) => (
          <li
            className='flex justify-between items-center gap-2 hover:bg-neutral-200'
            key={item.value}
            title={item.label}
          >
            <div
              className='flex items-center min-w-0'
            >
              <Checkbox
                ariaLabel={item.label}
                id={`${attribute}-${item.value}`}
                checked={item.isRefined}
                onClick={() => refine(item.value)}
              />
              <label
                className='px-1 py-0.5 break-words min-w-0 hover:cursor-pointer'
                htmlFor={`${attribute}-${item.value}`}
              >
                { item.label }
              </label>
            </div>
            <span
              className='shrink-0 text-xs font-semibold px-3'
            >
              { item.count }
            </span>
          </li>
        ))}
      </ul>
      { canToggleShowMore && !query && (
        <button
          className='flex items-center gap-x-1 mt-1'
          onClick={toggleShowMore}
          type='button'
        >
          <Icon
            name={isShowingMore ? 'zoom_out' : 'zoom_in'}
          />
          <span
            className='py-1'
          >
            { isShowingMore ? t('showLess') : t('showMore') }
          </span>
        </button>
      )}
    </Facet>
  );
};

export default ListFacet;
