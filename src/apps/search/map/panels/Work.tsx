import BasePanel from '@apps/search/map/panels/BasePanel';
import { getExclusions } from '@utils/exclusions';
import WorksService from '@backend/api/coreData/works';
import TranslationContext from '@contexts/TranslationContext';
import { useRuntimeConfig } from '@peripleo/peripleo';
import { useCallback, useContext } from 'react';
import { hasDetailPage } from '@utils/detailPagePaths';

interface Props {
  className?: string;
}

const Work = (props: Props) => {
  const config = useRuntimeConfig();
  const { lang } = useContext(TranslationContext);

  /**
   * Resolves the URL for the detail page.
   */
  const resolveDetailPageUrl = useCallback((work) => {
    if (work && hasDetailPage('works', config)) {
      return `/${lang}/works/${work.uuid}`;
    }
  }, [lang]);

  return (
    <BasePanel
      className={props.className}
      name='work'
      exclusions={getExclusions(config, 'works')}
      resolveDetailPageUrl={resolveDetailPageUrl}
      service={WorksService}
    />
  );
}

export default Work;
