import { useStore } from '@nanostores/react';
import NotificationsStore from '@store/notifications';
import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';

// core-data's Notification is on every page for the rare toast, so it loads
// only once a notification is first shown. Imported through a one-export
// module: a dynamic import of the package needs its whole namespace, which
// pulled all of core-data (the IIIF viewers, hls.js) into every page.
const Notification = lazy(() => import('@components/Notification'));

const DEFAULT_ICON = {
  className: 'fill-green-400',
  name: 'info',
  size: 24
};

const DEFAULT_TIMEOUT = 4000;

const NotificationPanel = () => {
  const {
    content,
    header,
    icon = DEFAULT_ICON,
    open,
    timeout = DEFAULT_TIMEOUT
  } = useStore(NotificationsStore);

  /**
   * Callback fired when the notification panel is closed.
   */
  const onClose = useCallback(() => NotificationsStore.set({ open: false }), []);

  // Mounted from the first notification on, so closing can animate.
  const [shown, setShown] = useState(false);
  useEffect(() => { if (open) setShown(true); }, [open]);

  if (!shown) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <Notification
        content={content}
        header={header}
        icon={icon}
        onClose={onClose}
        open={open}
        timeout={timeout}
      />
    </Suspense>
  );
};

export default NotificationPanel;