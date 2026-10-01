import clsx from 'clsx';
import { useCallback } from 'react';

interface Props {
  className?: string;
  label?: string;
  size?: number;
}

/**
 * Back to the page the visitor came from on this atlas, or to its home page
 * when they arrived from elsewhere (going to an empty or foreign referrer
 * just reloaded the page or left the atlas). The arrow is drawn here rather
 * than taken from core-data's Icon, which brings a 1.7 MB bundle.
 */
const BackButton = (props: Props) => {
  const onClick = useCallback(() => {
    const sameSite = document.referrer && new URL(document.referrer).origin === window.location.origin;

    if (sameSite && window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = `/${window.location.pathname.split('/')[1] || ''}`;
    }
  }, []);

  const size = props.size || 30;

  return (
    <button
      aria-label={props.label || 'Back'}
      className={clsx(
        'rounded-full w-8 h-8 flex items-center justify-center',
        props.className
      )}
      onClick={onClick}
      type='button'
    >
      <svg aria-hidden='true' fill='none' height={size} stroke='currentColor' strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} viewBox='0 0 24 24' width={size}>
        <path d='M19 12H5' />
        <path d='m12 19-7-7 7-7' />
      </svg>
    </button>
  );
};

export default BackButton;