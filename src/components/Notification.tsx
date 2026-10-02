import { Notification } from '@performant-software/core-data';
import type { ComponentType } from 'react';

/**
 * core-data's Notification, in a module of its own so NotificationPanel can
 * load it lazily by this one export (see MediaGallery.tsx for why not a
 * dynamic import of the package).
 */
interface Props {
  content: string;
  header: string;
  icon: { className?: string, name: string, size?: number };
  onClose: () => void;
  open: boolean;
  timeout: number;
}

const Toast: ComponentType<Props> = Notification;

export default Toast;
