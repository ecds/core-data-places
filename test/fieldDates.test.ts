import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import UserDefinedFieldView from '../src/components/UserDefinedFieldView';

const render = (type: string, value: any, locale?: string) => renderToStaticMarkup(createElement(UserDefinedFieldView, { type, value, locale }));

describe('date fields', () => {
  it('shows a fuzzy date at its own precision', () => {
    expect(render('FuzzyDate', { start_date: '1911-01-01', end_date: '1911-12-31', accuracy: 0, range: false })).toBe('1911');
    expect(render('FuzzyDate', { start_date: '1983-03-01', end_date: '1983-03-31', accuracy: 1, range: false })).toBe('March 1983');
    expect(render('FuzzyDate', { start_date: '1861-01-01', end_date: '1865-12-31', accuracy: 0, range: true })).toBe('1861 - 1865');
    expect(render('FuzzyDate', { start_date: '1890-01-01', end_date: '1899-12-31', accuracy: 0, range: true, description: '1890s' })).toBe('1890s');
  });

  it('shows a full date as that day in any time zone', () => {
    expect(render('Date', '1983-03-15')).toBe('March 15, 1983');
    // Core Data's own form saves a day as local midnight in UTC.
    expect(render('Date', '1983-03-15T05:00:00.000Z')).toBe('March 15, 1983');
    expect(render('Date', '1983-03-14T23:00:00.000Z')).toBe('March 15, 1983');
  });

  it('shows a partial date at its own precision rather than inventing a day', () => {
    expect(render('Date', '1983-03-')).toBe('March 1983');
    expect(render('Date', 'sometime')).toBe('sometime');
  });

  it('reads in the page\'s language', () => {
    expect(render('Date', '1983-03-15', 'es')).toBe('15 de marzo de 1983');
    expect(render('Date', '1983-03-', 'fr')).toBe('mars 1983');
  });
});
