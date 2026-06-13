import { defineConfig, LocalAuthProvider } from 'tinacms';
import _ from 'underscore';
import config from '../public/config.json';
import I18n from './content/i18n';
import PagesCollection from './content/pages';
import PathsCollection from './content/paths';
import PostsCollection from './content/posts';
import { ClerkAuthProvider } from './auth-provider';
import { Clerk } from '@clerk/clerk-js';

const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === 'true';
const localContentPath = process.env.TINA_LOCAL_CONTENT_PATH;

// Clerk SSO is required for deployed CDP sites as of v1.9.0 — see docs/upgrade-notes.md.
// (Local development still uses LocalAuthProvider via TINA_PUBLIC_IS_LOCAL=true and needs no Clerk config.)
if (!isLocal && !process.env.TINA_PUBLIC_CLERK_PUBLIC_KEY) {
  throw new Error(
    'Clerk SSO is required for deployed CDP sites (since v1.9.0). Set TINA_PUBLIC_CLERK_PUBLIC_KEY (plus TINA_PUBLIC_CLERK_ORG_ID and CLERK_SECRET), or set TINA_PUBLIC_IS_LOCAL=true for local development. See docs/upgrade-notes.md.'
  );
}
const clerk = isLocal ? undefined : new Clerk(process.env.TINA_PUBLIC_CLERK_PUBLIC_KEY!);

export default defineConfig({
  authProvider: isLocal
    ? new LocalAuthProvider()
    : new ClerkAuthProvider({
      clerk,
      orgId: process.env.TINA_PUBLIC_CLERK_ORG_ID
    }),
  build: {
    outputFolder: 'admin',
    publicFolder: 'public',
  },
  cmsCallback: (cms) => {
    if (!isLocal) {
      import('./role-ui').then(({ applyRoleRestrictions }) => {
        applyRoleRestrictions(cms);
      });
    }
    return cms;
  },
  // In local dev the admin must talk to the `tinacms dev` GraphQL server
  // directly; '/api/tina/gql' only exists on deployed (self-hosted) sites.
  ...(isLocal ? {} : { contentApiUrlOverride: '/api/tina/gql' }),
  localContentPath,
  media: {
    loadCustomStore: async () => {
      const pack = await import('next-tinacms-s3');
      return pack.TinaCloudS3MediaStore;
    }
  },
  // See docs on content modeling for more info on how to setup new content models: https://tina.io/docs/schema/
  schema: {
    // Branding, navigation, and settings are no longer TinaCMS collections:
    // they are console-owned and emitted into the content tree at build
    // (branding.json, navbar/<locale>.json, and the public config.json the
    // frontend reads via @config). TinaCMS now edits longform content only —
    // pages, posts, paths, and i18n strings.
    collections: _.compact([
      PagesCollection,
      config.content?.collections?.includes('paths')
        ? PathsCollection
        : undefined,
      config.content?.collections?.includes('posts')
        ? PostsCollection
        : undefined,
      I18n
    ])
  }
});
