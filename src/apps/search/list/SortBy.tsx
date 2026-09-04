import { useContext, useMemo } from 'react';
import TranslationContext from '@contexts/TranslationContext';
import { useSortBy } from 'react-instantsearch';
import { useSearchConfig } from '@apps/search/SearchConfigContext';
import { toSortKey } from '@search/elasticsearch/settings';
import { DropdownMenu } from 'radix-ui';
import { Icon } from '@performant-software/core-data';

/**
 * Sort selector. InstantSearch expresses a sort as a target "index"; Searchkit
 * resolves `<index>_sort_<name>` to the named sort declared in the server-side
 * search settings (see `settings.ts`), and the bare index name is relevance.
 */
const SortBy = () => {
  const { t } = useContext(TranslationContext);
  const config = useSearchConfig();

  const indexName = config.elasticsearch.index_name;

  const sortFields = useMemo(() => [{
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

  const { currentRefinement, refine } = useSortBy({ items: sortFields });

  const currentSort = useMemo(
    () => sortFields.find((field) => field.value === currentRefinement),
    [currentRefinement, sortFields]
  );

  return (
    <div className='flex w-full items-center justify-end gap-4 pr-4'>
      <span className='font-bold'>
        { t('sortBy') }
      </span>
      <DropdownMenu.Root
        modal={false}
      >
        <DropdownMenu.Trigger
          asChild
        >
          <div
            className='flex items-center gap-x-2 cursor-pointer outline-hidden hover:bg-transparent'
          >
            {currentSort?.label}
            <Icon
              name='down'
            />
          </div>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className='flex flex-col bg-white rounded-md shadow-lg pt-1 w-[150px]'
          >
            {sortFields.map((field) => (
              <DropdownMenu.Item
                className='hover:cursor-pointer hover:bg-neutral-200 px-2 py-1 outline-hidden'
                onClick={() => refine(field.value)}
                key={field.value}
              >
                { field.label }
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
};

export default SortBy;
