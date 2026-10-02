import clsx from 'clsx';
import { FacetTimeline, useCachedHits } from '@performant-software/core-data';
import { useNavigate } from '@peripleo/peripleo';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRange } from 'react-instantsearch';
import _ from 'underscore';
import { useSearchConfig } from '@apps/search/SearchConfigContext';

interface Props {
  className?: string;
  padding?: number,
}

const TimelineView = (props: Props) => {
  const config = useSearchConfig();
  const hits = useCachedHits();
  const navigate = useNavigate();

  const { canRefine, start, range, refine } = useRange({
    attribute: config.timeline?.date_range_facet
  });
  const { min, max } = range;
  const [value, setValue] = useState([min, max]);
  const from = Math.max(min, Number.isFinite(start[0]) ? start[0] : min);
  const to = Math.min(max, Number.isFinite(start[1]) ? start[1] : max);

  /**
   * Sets the value on the state when the from/to values change.
   */
  useEffect(() => {
    setValue([from, to]);
  }, [from, to]);

  /**
   * Memo-izes the data to be displayed on the timeline as events: the hits
   * themselves on a dated search (the search handler gives each one
   * `start_date`/`end_date`, see search/elasticsearch/dates.ts), or the
   * records at `event_path` on an upstream-style config. Undated hits are left
   * off.
   */
  const data = useMemo(() => _.chain(hits)
    .map(
      (hit) => (
        // event_path not specified = event is the primary model
        config.timeline?.event_path
          ? hit[config.timeline.event_path]
          : hit
      )
    )
    .flatten()
    .compact()
    .uniq('uuid')
    .filter((event) => !_.isEmpty(event.start_date) || !_.isEmpty(event.end_date))
    .value(),
  [hits]);

  /**
   * On event click, opens the record: the hit's own panel on a dated search,
   * the event's on an upstream-style config.
   */
  const onEventClick = useCallback((ev) => navigate(
    config.timeline?.event_path ? `/events/${ev.id}` : `${config.route}/${ev.id || ev.uuid}`
  ), [config.route, config.timeline?.event_path]);

  /**
   * Only display if the facet is available to refine.
   */
  if (!canRefine) {
    return null;
  }

  return (
    <div
      className={clsx(
        'p-2',
        'bg-white/80',
        'backdrop-blur-sm',
        'shadow-sm',
        props.className
      )}
      // style prop required as dynamic class names are unsupported in Tailwind
      style={{ width: `calc(100vw - ${props.padding || 0}px)` }}
    >
      <FacetTimeline
        className='w-full max-w-full'
        data={data}
        onClick={onEventClick}
        range={range}
        refine={refine}
        start={value}
      />
    </div>
  )
};

export default TimelineView;