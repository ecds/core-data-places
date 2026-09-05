import BasePanel from '@apps/search/map/panels/BasePanel';
import { getExclusions } from '@utils/exclusions';
import OrganizationsService from '@backend/api/coreData/organizations';
import TranslationContext from '@contexts/TranslationContext';
import { useRuntimeConfig } from '@peripleo/peripleo';
import { useCallback, useContext } from 'react';
import { hasDetailPage } from '@utils/detailPagePaths';

interface Props {
  className?: string;
}

const Organization = (props: Props) => {
  const config = useRuntimeConfig();
  const { lang } = useContext(TranslationContext);

  /**
   * Resolves the URL for the detail page.
   */
  const resolveDetailPageUrl = useCallback((organization) => {
    if (organization && hasDetailPage('organizations', config)) {
      return `/${lang}/organizations/${organization.uuid}`;
    }
  }, [lang]);

  return (
    <BasePanel
      className={props.className}
      icon='participants'
      name='organization'
      exclusions={getExclusions(config, 'organizations')}
      renderItem={(organization) => (
        <p
          className='text-sm'
        >
          { organization.description }
        </p>
      )}
      resolveDetailPageUrl={resolveDetailPageUrl}
      service={OrganizationsService}
    />
  );
}

export default Organization;
