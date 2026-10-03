import { describe, expect, it } from 'vitest';
import { buildTopicTree, getTopicsConfig, toFeatureCollection, topicSlug, topicTrail } from '../src/utils/topics';

const topics = [
  { name: 'Church', slug: 'church', count: 12 },
  { name: 'Cemetery', slug: 'cemetery', count: 3 },
  { name: 'Lighthouse', slug: 'lighthouse', count: 1 },
  { name: 'AME Church', slug: 'ame-church', count: 2 }
];

describe('topics', () => {
  it('reads the config, dropping malformed groups and going three levels deep at most', () => {
    const config = getTopicsConfig({ topics: { enabled: true, title: ' Themes ', groups: [
      { label: 'Religious', terms: ['Church', 'Church', 7], groups: [{ label: 'Burial', terms: ['Cemetery'], groups: [{ label: 'Deep', terms: [], groups: [{ label: 'Too deep', terms: ['x'] }] }] }] },
      { label: '  ', terms: ['Lighthouse'] },
      'nonsense'
    ] } });
    expect(config.enabled).toBe(true);
    expect(config.title).toBe('Themes');
    expect(config.groups).toHaveLength(1);
    expect(config.groups[0].terms).toEqual(['Church']);
    expect(config.groups[0].groups[0].groups[0].groups).toEqual([]);
    expect(getTopicsConfig({}).enabled).toBe(false);
  });

  it('builds the tree from the curator\'s groups; the rest are ungrouped, by name; empty groups go', () => {
    const { tree, ungrouped } = buildTopicTree([
      { label: 'Religious', terms: ['Church', 'Unknown term'], groups: [{ label: 'Burial', terms: ['Cemetery'], groups: [] }] },
      { label: 'Empty', terms: ['Nothing here'], groups: [] }
    ], topics);
    expect(tree.map((node) => node.label)).toEqual(['Religious']);
    expect(tree[0].topics.map((topic) => topic.name)).toEqual(['Church']);
    expect(tree[0].groups[0].topics.map((topic) => topic.name)).toEqual(['Cemetery']);
    expect(ungrouped.map((topic) => topic.name)).toEqual(['AME Church', 'Lighthouse']);
  });

  it('finds where a topic sits, and slugs names for addresses', () => {
    const groups = [{ label: 'Religious', terms: ['Church'], groups: [{ label: 'Burial', terms: ['Cemetery'], groups: [] }] }];
    expect(topicTrail(groups, 'Cemetery')).toEqual(['Religious', 'Burial']);
    expect(topicTrail(groups, 'Lighthouse')).toBeNull();
    expect(topicSlug('AME Church')).toBe('ame-church');
  });

  it('maps the places that have a location', () => {
    const fc = toFeatureCollection([{ uuid: 'a', name: 'A', point: { lat: 32, lon: -81 } }, { uuid: 'b', name: 'B' }]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.coordinates).toEqual([-81, 32]);
  });
});
