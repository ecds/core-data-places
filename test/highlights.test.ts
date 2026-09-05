import { describe, expect, it } from 'vitest';
import { completeArrayHighlights } from '../src/pages/api/search.json';

const PRE = '<ais-highlight-0000000000>';
const POST = '<ais-highlight-0000000000/>';

describe('completeArrayHighlights', () => {
  it('restores the unmatched entries of a refined array field, in source order', () => {
    const hit = {
      types: ['Methodist Church', 'AGBNF'],
      _highlightResult: {
        types: [{ matchLevel: 'full', matchedWords: ['AGBNF'], value: `${PRE}AGBNF${POST}` }]
      }
    };

    expect(completeArrayHighlights(hit).types).toEqual([
      { matchLevel: 'none', matchedWords: [], value: 'Methodist Church' },
      { matchLevel: 'full', matchedWords: ['AGBNF'], value: `${PRE}AGBNF${POST}` }
    ]);
  });

  it('leaves complete arrays and scalar highlights alone', () => {
    const highlights = {
      types: [{ matchLevel: 'none', matchedWords: [], value: 'AGBNF' }],
      name: { matchLevel: 'full', matchedWords: ['Mizpah'], value: `${PRE}Mizpah${POST} Methodist` }
    };

    expect(completeArrayHighlights({ types: ['AGBNF'], name: 'Mizpah Methodist', _highlightResult: highlights })).toEqual(highlights);
    expect(completeArrayHighlights({ types: ['AGBNF'] })).toBeUndefined();
  });
});
