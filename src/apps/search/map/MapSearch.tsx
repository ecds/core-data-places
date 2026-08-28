import MapLayout from '@apps/search/map/MapLayout';
import { MapSearchContextProvider } from '@apps/search/map/MapSearchContext';
import MapSearchProvider from '@apps/search/map/MapSearchProvider';
import { RuntimeConfigProvider } from '@apps/search/SearchConfigContext';
import SearchProvider from '@apps/search/SearchProvider';
import TranslationContext from '@contexts/TranslationContext';
import { useTranslations } from '@i18n/useTranslations';
import { Peripleo, Router } from '@peripleo/peripleo';

interface Props {
  allowSave?: boolean;
  lang: string;
  name: string;
  preload?: boolean;
}

const MapSearch = ({ allowSave, lang, name, preload }: Props) => {
  const { t } = useTranslations();

  return (
    <RuntimeConfigProvider
      name={name}
    >
      <Router>
        <Peripleo>
          <SearchProvider>
            <MapSearchProvider>
              <MapSearchContextProvider
                allowSave={allowSave}
                preload={preload}
              >
                <TranslationContext.Provider
                  value={{lang, t}}
                >
                  <MapLayout />
                </TranslationContext.Provider>
              </MapSearchContextProvider>
            </MapSearchProvider>
          </SearchProvider>
        </Peripleo>
      </Router>
    </RuntimeConfigProvider>
  );
};

export default MapSearch;