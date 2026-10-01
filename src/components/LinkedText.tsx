import { Fragment } from 'react';

/**
 * Text with its web addresses as links: a field whose value is a URL (a
 * nomination file, a source record) or prose that mentions one. Only
 * http(s) addresses become links, opened in a new tab; everything else stays
 * text, escaped by React. A value that is nothing but a URL shows without
 * its scheme ("catalog.archives.gov/id/93208232"), shortened when long.
 */
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

// Sentence punctuation that follows a URL rather than belonging to it.
const TRAILING = /[.,;:!?)\]]+$/;

const MAX_DISPLAY = 60;

const display = (url: string) => {
  const text = url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  return text.length > MAX_DISPLAY ? `${text.slice(0, MAX_DISPLAY - 1)}…` : text;
};

interface Props {
  value?: string | null;
}

const LinkedText = ({ value }: Props) => {
  if (!value) {
    return null;
  }

  const text = String(value);
  const whole = text.trim();
  const parts: (string | { url: string })[] = [];
  let last = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0].replace(TRAILING, '');
    const start = match.index ?? 0;

    parts.push(text.slice(last, start), { url });
    last = start + url.length;
  }

  parts.push(text.slice(last));

  return (
    <>
      { parts.map((part, index) => (typeof part === 'string'
        ? <Fragment key={index}>{ part }</Fragment>
        : (
          <a
            className='underline underline-offset-2 break-all'
            href={part.url}
            key={index}
            rel='noopener noreferrer'
            target='_blank'
          >
            { part.url === whole ? display(part.url) : part.url }
          </a>
        )
      ))}
    </>
  );
};

export default LinkedText;
