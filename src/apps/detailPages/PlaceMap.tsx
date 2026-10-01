import { Peripleo, RuntimeConfig } from '@peripleo/peripleo';
import { LocationMarkers } from '@performant-software/geospatial';
import { normalizeRuntimeConfig } from '@utils/runtimeConfig';
import Map from '@components/Map';
import TranslationContext from '@contexts/TranslationContext';
import { useTranslations } from '@i18n/useTranslations';
import { useMemo } from 'react';
import { hasExtent } from '@utils/map';
import { Map as MapUtils } from '@performant-software/geospatial';

interface Props {
  classNames?: {
    controls?: string
    root?: string,
  };
  geometry: any;
  lang: string;
}

const PlaceMap = (props: Props) => {
  const { t } = useTranslations();

  const mapGeometry = useMemo(() => {
    if (props.geometry) {
      return {
        ...props.geometry,
        features: props.geometry.features.map((feature) => {
          const certaintyRadius = feature.properties?.originalProperties?.certainty_radius

          if (certaintyRadius) {
            return MapUtils.toCertaintyCircle(
              feature,
              certaintyRadius
            )
          }

          return feature;
        })
      }
    }
  }, [props.geometry])

  /**
   * A point is shown with a couple of miles around it (LocationMarkers'
   * default buffer). Anything with an extent — a district's boundary, a
   * route, several points, an uncertainty circle — is framed by that extent,
   * not lost as a speck inside a two-mile margin.
   */
  const framing = useMemo(() => (
    hasExtent(mapGeometry)
      ? { buffer: 0, boundingBoxOptions: { animate: false, padding: 32, maxZoom: 17 } }
      : { buffer: undefined, boundingBoxOptions: { animate: false } }
  ), [mapGeometry]);

  return (
    <TranslationContext.Provider
      value={{ t, lang: props.lang }}
    >
      <RuntimeConfig
        path='/config.json'
        preprocess={normalizeRuntimeConfig}
      >
        <Peripleo>
          <Map classNames={props.classNames}>
            <LocationMarkers
              boundingBoxOptions={framing.boundingBoxOptions}
              buffer={framing.buffer}
              data={mapGeometry}
            />
          </Map>
        </Peripleo>
      </RuntimeConfig>
    </TranslationContext.Provider>
  )
}

export default PlaceMap