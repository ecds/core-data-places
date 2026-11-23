let cached: boolean | undefined;

/**
 * Whether this browser can draw MapLibre maps. MapLibre 5 needs WebGL2, which
 * a browser lacks when hardware acceleration is turned off (and on some old or
 * locked-down machines). Without it, creating a map throws "Failed to
 * initialize WebGL", so callers show a notice instead of the map.
 *
 * On the server there is no browser to ask, so the answer is true and the
 * check runs again on the client.
 */
export const supportsWebGL = (): boolean => {
  if (typeof document === 'undefined') {
    return true;
  }

  if (cached !== undefined) {
    return cached;
  }

  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');

    cached = !!context;

    // Hand the test context back, since browsers cap how many can be open.
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    cached = false;
  }

  return cached;
};

/**
 * Forgets the cached answer (for tests).
 */
export const resetWebGLSupport = () => {
  cached = undefined;
};
