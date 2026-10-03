import { useContext } from 'react';
import TranslationContext from '@contexts/TranslationContext';
import { useSort } from '@apps/search/useSortItems';
import { DropdownMenu } from 'radix-ui';
import { Icon } from '@performant-software/core-data';
import clsx from 'clsx';

interface Props {
  className?: string;
}

/**
 * Sort selector for the map layout's results list: the same sorts, names and
 * `?sort=` as the list and grid layouts (`useSort`). Sorting orders the
 * list; the map shows the same places whatever the order (all results load,
 * up to the search's `result_limit`).
 */
const SortMenu = (props: Props) => {
  const { t } = useContext(TranslationContext);
  const {
    current: currentSort,
    currentRefinement,
    items: sortFields,
    refine
  } = useSort();

  return (
    <DropdownMenu.Root
      modal={false}
    >
      <DropdownMenu.Trigger
        asChild
      >
        <button
          className={clsx(
            'flex items-center gap-x-1.5 text-sm cursor-pointer rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-primary',
            props.className
          )}
          type='button'
        >
          <span className='text-neutral-600'>{ t('sortBy') }</span>
          <span className='font-semibold'>{ currentSort?.label }</span>
          <Icon
            name='down'
            size={14}
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align='end'
          className='z-50 flex flex-col bg-white rounded-md shadow-lg py-1 min-w-[150px] text-sm'
          sideOffset={4}
        >
          {sortFields.map((field) => (
            <DropdownMenu.Item
              aria-current={field.value === currentRefinement ? 'true' : undefined}
              className={clsx(
                'hover:cursor-pointer hover:bg-neutral-200 data-[highlighted]:bg-neutral-200 px-3 py-1.5 outline-hidden',
                { 'font-semibold': field.value === currentRefinement }
              )}
              key={field.value}
              onSelect={() => refine(field.value)}
            >
              { field.label }
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default SortMenu;
