import { useTranslations } from '@i18n/useTranslations';
import { useStore } from '@nanostores/react';
import PagesStore from '@store/pages';
import { useEffect, useState } from 'react';

interface Props {
  defaultTitle?: string;
  titleKey?: string;
}

const Title = ({ defaultTitle, titleKey }: Props) => {
  const [title, setTitle] = useState<string>(defaultTitle);

  const pageStore = useStore(PagesStore);
  const { t } = useTranslations();

  /**
   * Sets the title on the state based on the page store.
   */
  useEffect(() => {
    if (pageStore.title) {
      setTitle(pageStore.title);
    }
  }, [pageStore.title]);

  /**
   * Sets the title on the state based on the passed title key.
   */
  useEffect(() => {
    if (titleKey) {
      if (t(titleKey)) {
        setTitle(t(titleKey));
      }
    }
  }, [t, titleKey]);

  /**
   * Sets the document's title. The island lives in the page body: an island
   * element inside <head> ends the head where it stands, and everything after
   * it (meta description, link-preview tags) landed in the body, where
   * crawlers ignore it. The server renders the first <title> itself.
   */
  useEffect(() => {
    if (title) {
      document.title = title;
    }
  }, [title]);

  return null;
};

export default Title;