import ListLayout from '@apps/search/list/ListLayout';
import { RuntimeConfigProvider } from '@apps/search/SearchConfigContext';
import TranslationContext from '@contexts/TranslationContext';
import { useTranslations } from '@i18n/useTranslations';
import ElasticSearch from '@apps/search/ElasticSearch';

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
      <ElasticSearch>
        <TranslationContext.Provider
          value={{ lang: props.lang, t }}
        >
          <ListLayout lang={props.lang} />
        </TranslationContext.Provider>
      </ElasticSearch>
    </RuntimeConfigProvider>
  );
};

export default ListSearch;