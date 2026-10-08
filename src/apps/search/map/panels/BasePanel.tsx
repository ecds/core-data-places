import type { Collection } from '@apps/search/ManifestThumbnail';
import MapSearchContext from '@apps/search/map/MapSearchContext';
import Base from '@backend/api/coreData/base';
import UserDefinedFieldView from '@components/UserDefinedFieldView';
import { hasFieldValue } from '@utils/fieldValues';
import TranslationContext from '@contexts/TranslationContext';
import {
  CoreData as CoreDataUtils,
  KeyValueList,
  RecordDetailPanel,
  useLoader
} from '@performant-software/core-data';
import { useSelection } from '@peripleo/maplibre';
import { useCurrentRoute, useNavigate } from '@peripleo/peripleo';
import { getNameView } from '@utils/people';
import { getCurrentId } from '@utils/router';
import clsx from 'clsx';
import {
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import _ from 'underscore';
import PanelHistoryContext from '@apps/search/map/PanelHistoryContext';
import { useSearchConfig } from '@apps/search/SearchConfigContext';
import { useRuntimeConfig } from '@peripleo/peripleo';
import { omitExcluded } from '@utils/exclusions';
import { getIiifOriginal, getPhotoUrl } from '@utils/photos';

// The IIIF viewer loads when a visitor opens the place's gallery (see
// @components/MediaGallery), and the media thumbnails (Clover's, which bring
// hls.js for video) when a place with media is shown — not with the map.
const MediaGallery = lazy(() => import('@components/MediaGallery'));
const ManifestThumbnail = lazy(() => import('@apps/search/ManifestThumbnail'));
import { Map as MapUtils } from '@performant-software/geospatial';

interface Props {
  className?: string;
  icon?: string;
  name: string;
  exclusions?: string[];
  /** The field holding the record's photo address (utils/photos.ts). */
  photoField?: string | null;
  renderItem?: (item: any) => JSX.Element;
  renderName?: (item: any) => string;
  resolveDetailPageUrl?: (item: any) => string;
  resolveGeometry?: (item: any) => any;
  service: Base;
}

const INVERSE_SUFFIX = '_inverse';

const BasePanel = (props: Props) => {
  const [manifestUrl, setManifestUrl] = useState<string | undefined>();
  const [coverUrl, setCoverUrl] = useState(null);
  const [lastClicked, setLastClicked] = useState(null);
  const { panelHistory, setPanelHistory } = useContext(PanelHistoryContext);

  const navigate = useNavigate();
  const config = useSearchConfig();
  // The console's address: a photo field can hold one of the atlas's own
  // images (a KMZ's packed photo) as a console path.
  const assetBase = (useRuntimeConfig() as any)?.core_data?.url;
  const { lang, t } = useContext(TranslationContext);
  const { setSelected } = useSelection();

  const route = useCurrentRoute();
  const id = getCurrentId(route);

  const exclude = props.exclusions || [];

  const { setSelectedPlace } = useContext(MapSearchContext);
  
  /**
   * Transforms the passed list of items and groups them by the relationship ID.
   */
  const getRelatedRecords = useCallback((items, icon, transformItem) => {
    const transformedRecords = [];

    _.each(items, (item) => {
      const relationshipId = item.project_model_relationship_uuid;
      const inverse = item.project_model_relationship_inverse;
      const key = `${relationshipId}${inverse ? INVERSE_SUFFIX : ''}`;

      let groupedRecords = _.findWhere(transformedRecords, { relationshipId });

      if (!groupedRecords) {
        groupedRecords = {
          relationshipId,
          icon,
          items: [],
          title: t(key)
        }

        transformedRecords.push(groupedRecords);
      }

      groupedRecords.items.push(transformItem(item));
    });

    return transformedRecords;
  }, [t]);
  
  const onClose = useCallback(() => {
    navigate('/');
    setSelected(null);
    setPanelHistory([]);
  }, []);

  /**
   * When back arrow is clicked, navigate to previous record in panelHistory
   */
  const onGoBack = useCallback(() => {
    if (panelHistory.length > 1) {
      const prev = panelHistory[panelHistory.length - 2];
      onNavigate(prev.name, prev.uuid, prev.model);
    }
  }, [panelHistory]);
  
  /**
   * Loads the base record from the Core Data API.
  */
  const onLoad = () => props.service.fetchOne(id);
  const { data } = useLoader(onLoad, null, [id, props.service]);
  
  /**
   * Loads the related events from the Core Data API.
  */
  const onLoadEvents = () => props.service.fetchRelatedEvents(id, { per_page: 0 });
  const { data: { events = [] } = {}, loading: eventsLoading } = useLoader(onLoadEvents, null, [id, props.service]);

  /**
   * Loads the related instances from the Core Data API.
   */
  const onLoadInstances = () => props.service.fetchRelatedInstances(id, { per_page: 0 });
  const { data: { instances = [] } = {}, loading: instancesLoading } = useLoader(onLoadInstances, null, [id, props.service]);

  /**
   * Loads the related items from the Core Data API.
   */
  const onLoadItems = () => props.service.fetchRelatedItems(id, { per_page: 0 });
  const { data: { items = [] } = {}, loading: itemsLoading } = useLoader(onLoadItems, null, [id, props.service]);

  /**
   * Loads the related organizations from the Core Data API.
   */
  const onLoadOrganizations = () => props.service.fetchRelatedOrganizations(id, { per_page: 0 });
  const { data: { organizations = [] } = {}, loading: organizationsLoading } = useLoader(onLoadOrganizations, null, [id, props.service]);

  /**
   * Loads the media contents from the Core Data API.
   */
  const onLoadMediaContents = () => props.service.fetchRelatedMedia(id, { per_page: 0 });
  const { data: { mediaContents = [] } = {}, loading: mediaContentsLoading } = useLoader(onLoadMediaContents, null, [id, props.service]);

  /**
   * Loads the IIIF collection manifest from the Core Data API.
  */
 const onLoadManifests = () => props.service.fetchRelatedManifests(id, { per_page: 0 });
 const { data: collection = {}, loading: collectionLoading }: { collection: Collection, loading: boolean } = useLoader(onLoadManifests, null, [id, props.service]);
 
 /**
  * Loads the related people from the Core Data API.
 */
const onLoadPeople = () => props.service.fetchRelatedPeople(id, { per_page: 0});
const { data: { people = [] } = {}, loading: peopleLoading } = useLoader(onLoadPeople, null, [id, props.service]);

/**
 * Loads the related place records from the Astro API.
*/
  const onLoadPlaces = () => props.service.fetchRelatedPlaces(id, { per_page: 0 });
  const { data: { places = [] } = {}, loading: placesLoading } = useLoader(onLoadPlaces, null, [id, props.service]);

  /**
   * Loads the related taxonomies from the Core Data API.
   */
  const onLoadTaxonomies = () => props.service.fetchRelatedTaxonomies(id, { per_page: 0 });
  const { data: { taxonomies = [] } = {}, loading: taxonomiesLoading } = useLoader(onLoadTaxonomies, null, [id, props.service]);
  
  /**
   * Loads the related works from the Core Data API.
  */
  const onLoadWorks = () => props.service.fetchRelatedWorks(id, { per_page: 0 });
  const { data: { works = [] } = {}, loading: worksLoading } = useLoader(onLoadWorks, null, [id, props.service]);
  
  /**
   * Memo-izes the base record.
  */
 const item = useMemo(() => {
   let item;
   
   if (data) {
     item = omitExcluded(data[props.name], exclude);
    }

    return item;
  },
  [data, props.name]);

  /**
   * Updates the cover URL when the record or loading states change.
  */
 useEffect(() => {
   setCoverUrl((prev) => {
     // include a placeholder if the previous record had a cover image
      // to avoid sudden content shifting.
      if (mediaContentsLoading && prev) {
        return '/placeholder.png'
      }
      
      if (mediaContents.length > 0) {
        return mediaContents[0].content_preview_url
      }

      // The record's own photo field. Read from the record as loaded: the
      // field is excluded from the panel's field list.
      return getPhotoUrl(data?.[props.name], props.photoField, assetBase)
    })
  }, [item, mediaContentsLoading])

  /**
   * Swaps an IIIF preview that can't be loaded for its original (a photo
   * smaller than the preview size has no preview; see getIiifOriginal). The
   * panel's image element isn't ours, so the preview is tried here first.
   */
  useEffect(() => {
    const original = getIiifOriginal(coverUrl);

    if (!original) {
      return undefined;
    }

    let current = true;
    const probe = new Image();

    probe.onerror = () => {
      if (current) {
        setCoverUrl((url) => (url === coverUrl ? original : url));
      }
    };
    probe.src = coverUrl;

    return () => {
      current = false;
      probe.onerror = null;
    };
  }, [coverUrl]);
  
  /**
   * Memo-izes the geometry.
   */
  const geometryData = useMemo(() => {
    if (props.resolveGeometry && item) {
      return props.resolveGeometry(item);
    }

    if (!_.isEmpty(places.filter((place) => place.place_geometry))) {
      const result = {
        geometry: CoreDataUtils.toFeatureCollection(
          places.filter((place) => place.place_geometry)
        ),
        properties: {
          certainty_radius: Math.max(0, ...places.map(p => p.place_geometry?.properties?.certainty_radius || 0))
        }
      };

      for (let i = 0; i < result.geometry.features.length; i++) {
        const feature = result.geometry.features[i];
        const certaintyRadius = feature.properties?.originalProperties?.certainty_radius;

        if (certaintyRadius) {
          result.geometry.features[i] = MapUtils.toCertaintyCircle(feature, certaintyRadius);
        }
      }

      return result;
    }

    return null;
  }, [item, places]);

  /**
   * Hands the record's place to the map: MapView's SelectedPlace draws it and
   * moves the map to it. Cleared when the panel closes.
   */
  useEffect(() => {
    setSelectedPlace(geometryData
      ? { geometry: geometryData.geometry, animate: !geometryData.properties?.certainty_radius }
      : null);
  }, [geometryData]);

  useEffect(() => () => setSelectedPlace(null), []);

  /**
   * Memo-izes the related media items.
   */
  const relatedManifest = useMemo(() => {
    if (_.isEmpty(collection.items)) {
      return [];
    }
    
    const count = _.reduce(collection.items, (memo, item) => memo + item.item_count, 0);
    const title = t('relatedMedia', { count });

    return [{
      horizontal: true,
      items: _.map(collection.items, (item) => item),
      renderItem: (item) => (
        <Suspense fallback={<div className='ps-6 pe-6 h-20 w-32' />}>
          <ManifestThumbnail
            className='ps-6 pe-6'
            itemCount={item.item_count}
            name={_.first(item.label?.en)}
            onClick={() => setManifestUrl(item.id)}
            thumbnail={item.thumbnail}
          />
        </Suspense>
        ),
      renderTitle: () => title,
      title
    }];
  }, [collection]);

  /**
   * Memo-izes the name.
   */
  const name = useMemo(() => (item && props.renderName && props.renderName(item)) || item?.name, [item]);

  /**
   * Helper function for truncating the history to a certain point
   */
  const getHistoryByIndex = useCallback((history, index) => ([...history].slice(0, index + 1)), []);

  /**
   * Updates the panel history array when the name changes.
   */
  useEffect(() => {
    if (id && route && name) {
      const ind = panelHistory.findIndex((item) => item.uuid === id);
      //note that this hook will trigger redundantly after we navigate from within the panel;
      //in this case we should have ind = panelHistory.length - 1. We want to avoid resetting
      //panelHistory in this case so we don't get into loops.
      if (ind >= 0 && ind < panelHistory.length - 1) {
        //in this case, we've gone back to something already visited, so slice the history back to it
        setPanelHistory((current) => (getHistoryByIndex(current, ind)));
      } else if (ind < 0) {
        //we get here if this is the first record or if something weird happened. Reset the history.
        setPanelHistory([{
          name,
          uuid: id,
          route
        }]);
      }
    }
  }, [name]);

  /**
   * After we click on a related record and update panelHistory, navigate to it.
   */
  useEffect(() => {
    if (lastClicked && panelHistory.length && id !== panelHistory[panelHistory.length - 1].uuid) {
      const current = panelHistory[panelHistory.length - 1];
      navigate(current.route);
    }
  }, [lastClicked]);

  /**
   * When a related record is clicked, update panelHistory and then navigate.
   */
  const onNavigate = useCallback((name: string, uuid: string, route: string) => {
    const ind = panelHistory.findIndex((item) => item.uuid === uuid);
    setPanelHistory((current) => (ind < 0 ? [...current, { name, uuid, route }] : getHistoryByIndex(current, ind)));
    setLastClicked(uuid);
  }, [panelHistory]);

  /**
   * Transforms the related events.
   */
  const relatedEvents = useMemo(() => getRelatedRecords(events, 'date', (event) => ({
    name: event.name,
    onClick: () => onNavigate(event.name, event.uuid, `/events/${event.uuid}`)
  })), [getRelatedRecords, events]);

  /**
   * Transforms the related instances.
   */
  const relatedInstances = useMemo(() => getRelatedRecords(instances, null, (instance) => ({
    name: instance.name,
    onClick: () => onNavigate(instance.name, instance.uuid, `/instances/${instance.uuid}`)
  })), [getRelatedRecords, instances]);

  /**
   * Transforms the related items.
   */
  const relatedItems = useMemo(() => getRelatedRecords(items, null, (item) => ({
    name: item.name,
    onClick: () => onNavigate(item.name, item.uuid, `/items/${item.uuid}`)
  })), [getRelatedRecords, items]);

  /**
   * Transforms the related organizations.
   */
  const relatedOrganizations = useMemo(() => getRelatedRecords(organizations, 'occupation', (organization) => ({
    name: organization.name,
    onClick: () => onNavigate(organization.name, organization.uuid, `/organizations/${organization.uuid}`)
  })), [getRelatedRecords, organizations]);

  /**
   * Transforms the related people.
   */
  const relatedPeople = useMemo(() => getRelatedRecords(people, 'person', (person) => ({
    name: getNameView(person),
    onClick: () => onNavigate(getNameView(person), person.uuid, `/people/${person.uuid}`)
  })), [getRelatedRecords, people]);

  /**
   * Transforms the related places.
   */
  const relatedPlaces = useMemo(() => getRelatedRecords(places, 'location', (place) => ({
    name: place.name,
    onClick: () => onNavigate(place.name, place.uuid, `/places/${place.uuid}`)
  })), [getRelatedRecords, places]);

  /**
   * Transforms the related taxonomies.
   */
  const relatedTaxonomies = useMemo(() => getRelatedRecords(taxonomies, null, (taxonomy) => ({
    name: taxonomy.name
  })), [getRelatedRecords, taxonomies]);

  /**
   * Transforms the related works.
   */
  const relatedWorks = useMemo(() => getRelatedRecords(works, null, (work) => ({
    name: work.name,
    onClick: () => onNavigate(work.name, work.uuid, `/works/${work.uuid}`)
  })), [getRelatedRecords, works]);

  /**
   * Renders the user-defined field value for the passed data type.
   */
  const renderUserDefined = useCallback((type: string, value: any) => (
    <UserDefinedFieldView
      locale={lang}
      type={type}
      value={value}
    />
  ), [lang]);

  /**
   * Memo-izes user defined field values.
   *
   * @type {UserDefinedField[]|*[]}
   */
  const userDefined = useMemo(() => (
    _.chain(item?.user_defined || [])
      .values()
      .filter((u) => hasFieldValue(u.value))
      .map(({ label, type, value }) => ({
        label,
        value: renderUserDefined(type, value)
      }))
      .value()
  ), [item, renderUserDefined]);

  /**
   * Memo-izes included relations
   */
  const relations = () => {
    let ret = [];

    if(!exclude.includes('relatedEvents')) ret = ret.concat(relatedEvents);
    if(!exclude.includes('relatedInstances')) ret = ret.concat(relatedInstances);
    if(!exclude.includes('relatedItems')) ret = ret.concat(relatedItems);
    if(!exclude.includes('relatedOrganizations')) ret = ret.concat(relatedOrganizations);
    if(!exclude.includes('relatedManifest')) ret = ret.concat(relatedManifest);
    if(!exclude.includes('relatedPeople')) ret = ret.concat(relatedPeople);
    if(!exclude.includes('relatedPlaces')) ret = ret.concat(relatedPlaces);
    if(!exclude.includes('relatedTaxonomies')) ret = ret.concat(relatedTaxonomies);
    if(!exclude.includes('relatedWorks')) ret = ret.concat(relatedWorks);

    return ret;
  };

  return (
    <aside
      className={clsx(
        'flex',
        'flex-col',
        'bg-white',
        'backdrop-blur-sm',
        'overflow-y-auto',
        props.className
      )}
    >
      <RecordDetailPanel
        breadcrumbs={panelHistory.length > 1 && _.map(panelHistory.slice(-2), (item) => (item.name))}
        count
        coverUrl={coverUrl}
        icon={props.icon}
        loading={
          eventsLoading ||
          instancesLoading ||
          itemsLoading ||
          organizationsLoading ||
          mediaContentsLoading ||
          collectionLoading ||
          peopleLoading ||
          placesLoading ||
          taxonomiesLoading ||
          worksLoading
        }
        onClose={onClose}
        onGoBack={panelHistory.length > 1 && onGoBack}
        relations={relations()}
        title={name}
        detailPageUrl={props.resolveDetailPageUrl(item)}
      >
        { item && props.renderItem && props.renderItem(item) }
        { !_.isEmpty(userDefined) && (
          <KeyValueList
            items={userDefined}
          />
        )}
      </RecordDetailPanel>
      { manifestUrl && (
        <Suspense fallback={null}>
          <MediaGallery
            manifestUrl={manifestUrl}
            onClose={() => setManifestUrl(null)}
          />
        </Suspense>
      )}
    </aside>
  );
};

export default BasePanel;
