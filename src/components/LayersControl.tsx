import { Popover } from 'radix-ui';
import _ from 'underscore';

export interface LayersControlOverlay {
  name: string;
  /** Shown now. */
  visible: boolean;
  /** 0–1. */
  opacity: number;
  /** False for one the year slider shows (its opacity only is offered here). */
  togglable: boolean;
  /** The map can change its opacity (not GeoJSON overlays). */
  adjustable: boolean;
}

interface Props {
  baseLayers: { name: string }[];
  baseLayer?: string;
  onChangeBaseLayer: (name: string) => void;
  overlays: LayersControlOverlay[];
  onToggleOverlay: (name: string, visible: boolean) => void;
  onChangeOpacity: (name: string, opacity: number) => void;
  className?: string;
  labels: { button: string, baseLayers: string, overlays: string, opacity: string };
}

/**
 * The map's layers: the base map (one of), the overlays (any of), and how
 * opaque each overlay shown draws — a historic map faded to read the modern
 * streets beneath. Plain form controls in a popover, so it works with the
 * keyboard and a screen reader as it does with a pointer.
 */
const LayersControl = (props: Props) => (
  <Popover.Root>
    <Popover.Trigger asChild>
      <button aria-label={props.labels.button} className={props.className} title={props.labels.button} type='button'>
        <svg aria-hidden='true' fill='none' height='20' stroke='currentColor' strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' viewBox='0 0 24 24' width='20'>
          <path d='m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z' />
          <path d='m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65' />
          <path d='m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65' />
        </svg>
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        align='start'
        className='z-30 w-72 max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto rounded-md bg-white p-4 text-sm shadow-lg outline-hidden'
        collisionPadding={16}
        side='left'
        sideOffset={10}
      >
        { props.baseLayers.length > 1 && (
          <fieldset className='mb-3'>
            <legend className='mb-1 font-semibold text-neutral-700'>{ props.labels.baseLayers }</legend>
            { _.map(props.baseLayers, (layer) => (
              <label className='flex cursor-pointer items-center gap-2 py-0.5' key={layer.name}>
                <input
                  checked={props.baseLayer === layer.name}
                  name='og-base-layer'
                  onChange={() => props.onChangeBaseLayer(layer.name)}
                  type='radio'
                />
                { layer.name }
              </label>
            ))}
          </fieldset>
        )}
        { props.overlays.length > 0 && (
          <fieldset>
            <legend className='mb-1 font-semibold text-neutral-700'>{ props.labels.overlays }</legend>
            { _.map(props.overlays, (overlay) => (
              <div className='py-1' key={overlay.name}>
                { overlay.togglable ? (
                  <label className='flex cursor-pointer items-center gap-2'>
                    <input
                      checked={overlay.visible}
                      onChange={(e) => props.onToggleOverlay(overlay.name, e.target.checked)}
                      type='checkbox'
                    />
                    { overlay.name }
                  </label>
                ) : (
                  <span>{ overlay.name }</span>
                )}
                { overlay.visible && overlay.adjustable && (
                  <label className='mt-1 flex items-center gap-2 pl-6 text-neutral-600'>
                    <span className='w-16 shrink-0'>{ props.labels.opacity }</span>
                    <input
                      aria-label={`${overlay.name}: ${props.labels.opacity}`}
                      aria-valuetext={`${Math.round(overlay.opacity * 100)}%`}
                      className='grow accent-current'
                      max={100}
                      min={0}
                      onChange={(e) => props.onChangeOpacity(overlay.name, Number(e.target.value) / 100)}
                      step={5}
                      type='range'
                      value={Math.round(overlay.opacity * 100)}
                    />
                    <span aria-hidden='true' className='w-10 text-right tabular-nums'>{ Math.round(overlay.opacity * 100) }%</span>
                  </label>
                )}
              </div>
            ))}
          </fieldset>
        )}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
);

export default LayersControl;
