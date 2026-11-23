import TranslationContext from '@contexts/TranslationContext';
import clsx from 'clsx';
import React, { type ErrorInfo, type ReactNode, useContext } from 'react';

interface NoticeProps {
  className?: string;
}

/**
 * Shown in a map's place when the browser can't draw it (no WebGL, usually
 * because hardware acceleration is off). The rest of the page keeps working.
 */
export const MapUnavailable = (props: NoticeProps) => {
  const { t } = useContext(TranslationContext);

  return (
    <div
      className={clsx('grow h-full w-full flex items-center justify-center bg-gray-100 text-gray-700 p-6', props.className)}
      data-map-unavailable
      role='note'
    >
      <p className='max-w-sm text-center text-sm'>{ t('mapUnavailable') }</p>
    </div>
  );
};

interface BoundaryProps {
  children: ReactNode;
  className?: string;
}

interface BoundaryState {
  hasError: boolean;
}

/**
 * Catches a map that fails as it starts (WebGL present but unusable, for
 * example a context the browser refuses) so the failure stays inside the map
 * instead of unmounting the whole page.
 */
export class MapErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Map failed to start; showing a notice instead.', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <MapUnavailable className={this.props.className} />;
    }

    return this.props.children;
  }
}
