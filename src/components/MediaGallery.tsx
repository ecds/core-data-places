import { MediaGallery } from '@performant-software/core-data';
import type { ComponentType } from 'react';

/**
 * core-data's IIIF media gallery, in a module of its own so pages can load it
 * lazily: `lazy(() => import('@components/MediaGallery'))` names only this
 * export, so the viewer stack it brings (Clover, OpenSeadragon, hls.js:
 * about 2 MB of script) lands in its own chunk. A dynamic import of the
 * package itself would need its whole namespace, and pull everything in up
 * front.
 */
interface Props {
  manifestUrl: string;
  onClose: () => void;
}

const Gallery: ComponentType<Props> = MediaGallery;

export default Gallery;
