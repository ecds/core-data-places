import { MapSearchContextProvider } from '@apps/search/map/MapSearchContext';
import { RuntimeConfigProvider, useSearchConfig } from '@apps/search/SearchConfigContext';
import SearchVisualizations, { ItemViews } from '@apps/session/SearchVisualizations';
import { fetchSessionItem } from '@backend/api/session';
import TranslationContext from '@contexts/TranslationContext';
import { getDateField } from '@search/elasticsearch/dates';
import { useTranslations } from '@i18n/useTranslations';
import { Button, ButtonGroup } from '@performant-software/core-data';
import { Peripleo } from '@peripleo/peripleo';
import type { SearchSession } from '@types';
import { useEffect, useState, type ComponentProps } from 'react';

interface Props {
  id: string;
  lang: string;
  sessionId?: string;
}

/**
 * The Timeline tab, shown only for a search whose records have dates: a dated
 * search (`dates`), or an upstream-style config with an `event_path`.
 */
const TimelineButton = (props: ComponentProps<typeof Button>) => {
  const config = useSearchConfig();

  if (!getDateField(config) && !config?.timeline?.event_path) {
    return null;
  }

  return <Button {...props} />;
};

const SearchItem = (props: Props) => {
  const [item, setItem] = useState<SearchSession | undefined>();
  const [view, setView] = useState<number>(ItemViews.map);

  const { id, lang, sessionId } = props;
  const { t } = useTranslations();

  /**
   * Fetches the session item specified by the passed ID and sets it on the state.
   */
  useEffect(() => {
    fetchSessionItem('search', id, sessionId)
      .then(setItem);
  }, []);

  if (!item) {
    return null;
  }

  return (
    <RuntimeConfigProvider
      name={item?.searchName}
    >
      <Peripleo>
        <TranslationContext.Provider
          value={{ lang, t }}
        >
          <div
            className='flex justify-between items-center'
          >
            <div>
              <h4
                className='font-bold m-0'
              >
                { item.name }
              </h4>
              <div className='mt-1 flex items-center gap-x-1 text-gray-500'>
                { t(`index_${item.searchName}`) }
              </div>
            </div>
            <ButtonGroup
              className='py-4 text-sm'
              rounded
            >
              <Button
                onClick={() => setView(ItemViews.map)}
                secondary={view === ItemViews.map}
              >
                { t('map') }
              </Button>
              <Button
                onClick={() => setView(ItemViews.table)}
                secondary={view === ItemViews.table}
              >
                { t('table') }
              </Button>
              <TimelineButton
                onClick={() => setView(ItemViews.timeline)}
                secondary={view === ItemViews.timeline}
              >
                { t('timeline') }
              </TimelineButton>
            </ButtonGroup>
          </div>
          <SearchVisualizations
            data={item.data}
            view={view}
          />
        </TranslationContext.Provider>
      </Peripleo>
    </RuntimeConfigProvider>
  );
};

export default SearchItem;