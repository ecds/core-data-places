import { fetchPaths } from '@backend/tina';

/**
 * Returns the list of paths for the passed params.
 *
 * @param params
 */
export const getPaths = async (params: any = {}) => {
  const data = await fetchPaths(params);

  // fetchPaths returns null when the generated client has no path queries
  // (e.g. a content repo without path documents).
  return {
    ...data,
    paths: data?.paths?.map((item) => ({
      ...item,
      body: null
    })) || [],
  };
};