import TranslationContext from '@contexts/TranslationContext';
import { Checkbox } from '@performant-software/core-data';
import { useContext } from 'react';
import { useSearchConfig } from '@apps/search/SearchConfigContext';
import MapSearchContext from '@apps/search/map/MapSearchContext';

/**
 * The "Filter by map bounds" toggle. It only flips the flag: the viewport
 * listener that turns the flag into an `insideBoundingBox` refinement lives in
 * `ViewportRefinement`, which renders inside `<Map>` — this component sits above
 * the map's own `MapProvider`, where `useMap()` is null (the reason core-data's
 * `useGeoSearchToggle` cannot be used here).
 */
const GeosearchFilter = () => {
  const config = useSearchConfig();
  const { filterByMapBounds, setFilterByMapBounds } = useContext(MapSearchContext);
  const { t } = useContext(TranslationContext);

  if (!config.geosearch) {
    return null;
  }

  return (
    <div
      className='text-sm flex items-center'
    >
      <Checkbox
        ariaLabel={t('filterMapBounds')}
        checked={filterByMapBounds}
        id='filterMapBounds'
        onClick={(checked) => setFilterByMapBounds(checked)}
      />
      <label
        htmlFor='filterMapBounds'
      >
        { t('filterMapBounds') }
      </label>
    </div>
  );
};

export default GeosearchFilter;