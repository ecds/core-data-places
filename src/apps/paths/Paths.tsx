import { useTranslations } from '@i18n/useTranslations';
import TranslationContext from '@contexts/TranslationContext';
import PathList from '@apps/paths/PathList';

interface Props {
  lang: string;
  config?: any;
}

const Paths = (props: Props) => {
  const { t } = useTranslations();

  return (
    <TranslationContext.Provider
      value={{ lang: props.lang, t }}
    >
      <PathList
        config={props.config}
        lang={props.lang}
      />
    </TranslationContext.Provider>
  );
};

export default Paths;
