import SearchConfigContext from '@apps/search/SearchConfigContext';
import TranslationContext from '@contexts/TranslationContext';
import { Icon } from '@performant-software/core-data';
import { getConfiguredFacetLabel, getFacetLabel, isInverse } from '@utils/search';
import clsx from 'clsx';
import { useContext, useMemo, type ReactNode } from 'react';
import { useHits } from 'react-instantsearch';

interface Props {
  attribute: string;
  children: ReactNode,
  className?: string;
  icon?: string;
}

/**
 * A filter's heading: the label the atlas gave it, else one derived from the
 * attribute (relationship / field name).
 */
export const useFacetLabel = (attribute: string) => {
  const { t } = useContext(TranslationContext);

  const searchConfig = useContext(SearchConfigContext)?.searchConfig;

  const { items } = useHits();

  return useMemo(() => (
    getConfiguredFacetLabel(searchConfig, attribute) || getFacetLabel(attribute, t, isInverse(attribute, items))
  ), [attribute, items.length, searchConfig, t]);
};

const Facet = ({ attribute, children, className, icon }: Props) => {
  const label = useFacetLabel(attribute);

  return (
    <div
      className={clsx(
        'text-sm',
        'py-3',
        'border-b border-neutral-200',
        className
      )}
    >
      <p
        className='py-3 font-semibold flex items-center gap-1 uppercase'
      >
        { icon && (
          <Icon
            name={icon}
            size={24}
          />
        ) }
        { label }
      </p>
      { children }
    </div>
  );
};

export default Facet;
