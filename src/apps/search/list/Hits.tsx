import { useHits } from 'react-instantsearch';
import GridHit from '@components/custom/project/GridHit'
import ImageHit from '@components/custom/project/ImageHit'
import ListHit from '@components/custom/project/ListHit'
import { useSearchConfig } from '@apps/search/SearchConfigContext';
import { useRuntimeConfig } from '@peripleo/peripleo';
import { Highlight } from 'react-instantsearch';
import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  getAttributes,
  getFacetLabel,
  getHitValue,
  getRelatedItems,
  getRelationshipLabel,
  isInverse,
  isRelatedRecord
} from '@utils/search';
import { MediaGallery } from '@performant-software/core-data';
import clsx from 'clsx';
import TranslationContext from '@contexts/TranslationContext';
import { hasDetailPage } from '@utils/detailPagePaths';
import { Models } from '@types';

interface Props {
  lang: string;
}

const hitComponents = {
  grid: GridHit,
  image: ImageHit,
  list: ListHit
};

interface HighlightProps {
  attribute: string;
  className?: string;
  hit: any;
}

/**
 * Highlights a hit attribute where the engine provides a highlight for it, and
 * otherwise renders the plain value. Highlights are only built for top-level
 * fields; a nested path (`contained_in_place.name`) or a value with no
 * `_highlightResult` entry (a `{ label, value }` user-defined field) would
 * otherwise render blank or as "[object Object]".
 */
const HitHighlight = ({ attribute, className, hit }: HighlightProps) => {
  const highlight = hit?._highlightResult?.[attribute];
  const highlightable = !attribute.includes('.') && !!highlight && (Array.isArray(highlight) || typeof highlight.value === 'string');

  if (highlightable && !(highlight.value === '[object Object]')) {
    return (
      <Highlight
        attribute={attribute}
        className={className}
        hit={hit}
      />
    );
  }

  const value = getHitValue(hit, { name: attribute });

  return (
    <span
      className={className}
    >
      { Array.isArray(value) ? value.join(', ') : value }
    </span>
  );
};

const Hits = (props: Props) => {
  const searchConfig = useSearchConfig();
  const config = useRuntimeConfig();
  const { items } = useHits();
  const { t } = useContext(TranslationContext);
  const [manifestUrl, setManifestUrl] = useState<string | null>(null);

  const isGrid = useMemo(() => searchConfig.type !== 'list', [searchConfig.type]);

  const HitComponent = useMemo(() => hitComponents[searchConfig.type], [searchConfig.type]);

  // keep a mapping of facet labels outside the component
  // so we don't need to run the utility functions over and over
  const facetLabels = useRef({});

  /**
   * Construct a hits array with the values and labels so the custom hit components
   * don't need to rely on InstantSearch hooks, importing config, etc.
   */
  const hits = useMemo(() => {
    return items.map((hit) => {
      const relationships = {};

      // assemble relationships for hit components
      if (searchConfig.result_card?.relationships) {
        for (const key of searchConfig.result_card.relationships) {
          for (const item of getRelatedItems(hit, key)) {
            if (isRelatedRecord(item)) {
              if (relationships[key]) {
                relationships[key].items.push({
                  name: item.name,
                  uuid: item.uuid
                });
              } else {
                relationships[key] = {
                  label: getRelationshipLabel(key, t, !!item.inverse),
                  items: [{
                    name: item.name,
                    uuid: item.uuid
                  }]
                };
              }
            }
          }
        }
      }

      const attributes = [];

      for (const att of getAttributes(searchConfig)) {
        const value = getHitValue(hit, att);

        const trimmedName = att.name.replace(/\.\d+/g, '')
        let label = facetLabels.current[trimmedName];

        if (!label) {
          label = getFacetLabel(trimmedName, t, isInverse(trimmedName, items));
          facetLabels.current[att.name] = label;
        }

        if (value) {
          attributes.push({
            icon: att.icon,
            label,
            name: att.name,
            parser: att.parser,
            value
          });
        }
      }

      const tags = [];

      for (const tag of searchConfig.result_card?.tags || []) {
        const value = getHitValue(hit, tag);

        if (value) {
          tags.push({
            ...tag,
            value
          });
        }
      }

      return {
        hit,
        attributes,
        relationships,
        tags
      };
    });
  }, [items, t, searchConfig]);

  const isLinkable = useMemo(
    () => hasDetailPage(searchConfig.route.slice(1) as Models, config),
    [searchConfig.route, config]
  );

  const renderItem = useCallback((item: any) => {
    const hitComp = (
      <HitComponent
        highlightComponent={HitHighlight}
        key={item.hit.id}
        labels={{
          tags: t('tags')
        }}
        setManifestUrl={setManifestUrl}
        {...item}
      />
    );

    if (isLinkable) {
      return (
        <a
          href={`/${props.lang}${searchConfig.route}/${item.hit.id}`}
          key={item.hit.id}
        >
          { hitComp }
        </a>
      );
    }

    return hitComp
  }, [isLinkable, searchConfig.route, props.lang, t]);

  return (
    <>
      <div
        className={clsx(
          'gap-4 pb-6',
          {'w-full grid md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4': isGrid},
          {'flex flex-col': !isGrid}
        )}>
          { hits.map((hit) => renderItem(hit)) }
      </div>
      { manifestUrl && (
        <MediaGallery
          manifestUrl={manifestUrl}
          onClose={() => setManifestUrl(null)}
        />
      )}
    </>
  );
};

export default Hits;