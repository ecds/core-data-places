import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetWebGLSupport, supportsWebGL } from '../src/utils/webgl';

const fakeDocument = (getContext: () => unknown) => ({
  createElement: () => ({ getContext })
});

afterEach(() => {
  resetWebGLSupport();
  vi.unstubAllGlobals();
});

describe('supportsWebGL', () => {
  it('answers true on the server, where there is no document', () => {
    expect(supportsWebGL()).toBe(true);
  });

  it('is true when a WebGL2 context can be made, and releases it', () => {
    const loseContext = vi.fn();
    const getContext = vi.fn(() => ({ getExtension: () => ({ loseContext }) }));
    vi.stubGlobal('document', fakeDocument(getContext));

    expect(supportsWebGL()).toBe(true);
    expect(getContext).toHaveBeenCalledWith('webgl2');
    expect(loseContext).toHaveBeenCalled();
  });

  it('is false when the browser gives no WebGL2 context (hardware acceleration off)', () => {
    vi.stubGlobal('document', fakeDocument(() => null));
    expect(supportsWebGL()).toBe(false);
  });

  it('is false when asking for a context throws', () => {
    vi.stubGlobal('document', fakeDocument(() => { throw new Error('blocked'); }));
    expect(supportsWebGL()).toBe(false);
  });

  it('asks the browser once and caches the answer', () => {
    const getContext = vi.fn(() => null);
    vi.stubGlobal('document', fakeDocument(getContext));

    supportsWebGL();
    supportsWebGL();
    expect(getContext).toHaveBeenCalledTimes(1);
  });
});

