import { useContext } from 'react';
import TranslationContext from '@contexts/TranslationContext';
import { useSort } from '@apps/search/useSortItems';
import { DropdownMenu } from 'radix-ui';
import { Icon } from '@performant-software/core-data';

/**
 * Sort selector for the list and grid layouts (the map layout has its own,
 * `map/SortMenu.tsx`; both use `useSort`).
 */
const SortBy = () => {
  const { t } = useContext(TranslationContext);
  const {
    current: currentSort,
    currentRefinement,
    items: sortFields,
    refine
  } = useSort();

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
          <button
            className='flex items-center gap-x-2 cursor-pointer outline-hidden hover:bg-transparent focus-visible:ring-2 focus-visible:ring-primary rounded-sm'
            type='button'
          >
            {currentSort?.label}
            <Icon
              name='down'
            />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className='flex flex-col bg-white rounded-md shadow-lg pt-1 w-[150px]'
          >
            { /* Radio items: the current sort is announced as checked. */ }
            <DropdownMenu.RadioGroup
              onValueChange={refine}
              value={currentRefinement}
            >
              {sortFields.map((field) => (
                <DropdownMenu.RadioItem
                  className='hover:cursor-pointer hover:bg-neutral-200 data-[highlighted]:bg-neutral-200 data-[state=checked]:font-semibold px-2 py-1 outline-hidden'
                  key={field.value}
                  value={field.value}
                >
                  { field.label }
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
};

export default SortBy;
