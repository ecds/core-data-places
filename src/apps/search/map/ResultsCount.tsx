import TranslationContext from '@contexts/TranslationContext';
import { useContext } from 'react';

interface Props {
  /**
   * The search's total number of results (`nbHits`), not the hits loaded so far.
   */
  count: number;
}

/**
 * The map list's "N results" line. core-data's SearchList counts only the
 * hits it has been handed, which the map loads page by page and caps at
 * result_limit: its own line climbed while pages arrived (80, 120, 154) and
 * stopped at the cap on a large atlas. ListView hides that line and shows
 * this one.
 */
const ResultsCount = ({ count }: Props) => {
  const { t } = useContext(TranslationContext);

  return (
    <p className='text-sm italic'>
      { count === 1 ? t('resultsTotalSingular') : t('resultsTotal', { count: count.toLocaleString() }) }
    </p>
  );
};

export default ResultsCount;
