import { createDatabase, createLocalDatabase } from '@tinacms/datalayer';
import { MongodbLevel } from './db-provider';
import { GitHubProvider } from './git-provider';
import dotenv from 'dotenv';

dotenv.config();

const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === 'true';

const branch =
  process.env.GITHUB_BRANCH ||
  process.env.VERCEL_GIT_COMMIT_REF ||
  process.env.HEAD ||
  'main';

// Match the datalayer port used by `tinacms dev --datalayer-port <port>`;
// createLocalDatabase() otherwise always connects to the default 9000 and the
// dev server hangs forever at "Indexing local files" when they differ.
const datalayerPort = process.env.TINA_DATALAYER_PORT
  ? Number(process.env.TINA_DATALAYER_PORT)
  : undefined;

export default isLocal
  ? createLocalDatabase(datalayerPort ? { port: datalayerPort } : undefined)
  : createDatabase({
    gitProvider: new GitHubProvider({
      branch,
      owner: process.env.GITHUB_OWNER!,
      repo: process.env.GITHUB_REPO!,
      token: process.env.GITHUB_PERSONAL_ACCESS_TOKEN!,
    }),
    databaseAdapter: new MongodbLevel<string, Record<string, unknown>>({
      collectionName: process.env.MONGODB_COLLECTION_NAME || `${process.env.GITHUB_REPO}-${branch}`,
      dbName: process.env.MONGODB_NAME!,
      mongoUri: process.env.MONGODB_URI!,
    })
  });