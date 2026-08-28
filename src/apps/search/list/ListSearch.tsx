import ListLayout from '@apps/search/list/ListLayout';
import { RuntimeConfigProvider } from '@apps/search/SearchConfigContext';
import TranslationContext from '@contexts/TranslationContext';
import { useTranslations } from '@i18n/useTranslations';
import SearchProvider from '@apps/search/SearchProvider';

interface Props {
  lang: string;
  name: string;
}

const ListSearch = (props: Props) => {
  const { t } = useTranslations();

  return (
    <RuntimeConfigProvider
      name={props.name}
    >
      <SearchProvider>
        <TranslationContext.Provider
          value={{ lang: props.lang, t }}
        >
          <ListLayout lang={props.lang} />
        </TranslationContext.Provider>
      </SearchProvider>
    </RuntimeConfigProvider>
  );
};

export default ListSearch;