import clsx from 'clsx';
import { useId } from 'react';

interface Props {
  className?: string;
  label: string;
  noneLabel: string;
  onChange: (year: number | null) => void;
  value: number | null;
  years: number[];
}

/**
 * The historic-map year slider (see utils/mapYears.ts): one stop per dated
 * map, plus a first stop that shows none. A native range input, so it works
 * with the keyboard and announces the year.
 */
const MapYearControl = (props: Props) => {
  const id = useId();
  const position = props.value === null ? 0 : props.years.indexOf(props.value) + 1;
  const current = props.value === null ? props.noneLabel : String(props.value);

  return (
    <div
      className={clsx('bg-white/95 shadow rounded-lg px-3 py-2 w-56 text-sm', props.className)}
    >
      <label
        className='flex justify-between font-semibold'
        htmlFor={id}
      >
        <span>{ props.label }</span>
        <span aria-hidden='true'>{ current }</span>
      </label>
      <input
        aria-valuetext={current}
        className='w-full accent-primary'
        id={id}
        max={props.years.length}
        min={0}
        onChange={(event) => {
          const index = Number(event.target.value);
          props.onChange(index === 0 ? null : props.years[index - 1]);
        }}
        step={1}
        type='range'
        value={Math.max(position, 0)}
      />
      <div
        aria-hidden='true'
        className='flex justify-between text-xs text-gray-500'
      >
        <span>{ props.noneLabel }</span>
        <span>{ props.years[props.years.length - 1] }</span>
      </div>
    </div>
  );
};

export default MapYearControl;
