import { ALLOWED_ATTRIBUTES, ALLOWED_TAGS, isSafeUrl } from '@utils/htmlPolicy';
import parse, { domToReact, type DOMNode, type HTMLReactParserOptions } from 'html-react-parser';
import { createElement, Fragment } from 'react';

/**
 * Renders tenant-supplied HTML (e.g. a Core Data rich-text field) as React
 * elements rebuilt from an allowlist, rather than inserting the string: tags
 * outside the list are unwrapped (their text kept), script-like tags dropped
 * with their contents, attributes limited to the list, and links/images to
 * safe URLs. Text is escaped by React. The same code runs on the server (Astro
 * SSR) and in the browser (the map panel), where html-react-parser parses into
 * an inert document, so nothing in the input runs while it is read.
 */
const ALLOWED = new Set(ALLOWED_TAGS);

// Dropped with everything inside them.
const DROPPED = new Set([
  'base', 'button', 'embed', 'form', 'frame', 'frameset', 'head', 'iframe', 'input', 'link',
  'math', 'meta', 'noscript', 'object', 'option', 'script', 'select', 'style', 'svg',
  'template', 'textarea', 'title'
]);

const VOID = new Set(['br', 'hr', 'img']);

const REACT_NAMES: Record<string, string> = { colspan: 'colSpan', rowspan: 'rowSpan' };

const options: HTMLReactParserOptions = {
  replace: (node: DOMNode) => {
    if (node.type === 'comment' || node.type === 'directive' || node.type === 'cdata') {
      return <Fragment />;
    }

    if (!('name' in node)) {
      return undefined;
    }

    const name = node.name.toLowerCase();

    if (DROPPED.has(name)) {
      return <Fragment />;
    }

    const children = VOID.has(name) ? undefined : domToReact(node.children as DOMNode[], options);

    if (!ALLOWED.has(name)) {
      return <>{ children }</>;
    }

    const props: Record<string, string> = {};

    for (const attribute of [...(ALLOWED_ATTRIBUTES[name] || []), ...ALLOWED_ATTRIBUTES['*']]) {
      const value = node.attribs[attribute];

      if (value == null || attribute === 'target' || attribute === 'rel') {
        continue;
      }

      if ((attribute === 'href' || attribute === 'src') && !isSafeUrl(value, name === 'img' ? 'img' : 'a')) {
        continue;
      }

      props[REACT_NAMES[attribute] || attribute] = value;
    }

    if (name === 'a' && /^https?:/i.test(props.href || '')) {
      props.target = '_blank';
      props.rel = 'noopener noreferrer';
    }

    if (name === 'img') {
      props.loading = 'lazy';
    }

    return createElement(name, props, children);
  }
};

interface Props {
  className?: string;
  html?: string | null;
}

const SafeHtml = ({ className, html }: Props) => (
  <div className={className}>
    { html ? parse(html, options) : null }
  </div>
);

export default SafeHtml;
