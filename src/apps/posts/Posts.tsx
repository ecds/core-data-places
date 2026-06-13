import { useTranslations } from '@i18n/useTranslations';
import TranslationContext from '@contexts/TranslationContext';
import PostList from '@apps/posts/PostList';

interface Props {
  lang: string;
  config?: any;
}

const Posts = (props: Props) => {
  const { t } = useTranslations();

  return (
    <TranslationContext.Provider
      value={{ lang: props.lang, t }}
    >
      <PostList
        config={props.config}
        lang={props.lang}
      />
    </TranslationContext.Provider>
  );
};

export default Posts;
