/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GRAPHQL_URL: string | undefined;
  readonly VITE_GRAPHQL_REALTIME_URL: string | undefined;
  readonly VITE_USER_POOL_ID: string | undefined;
  readonly VITE_USER_POOL_CLIENT_ID: string | undefined;
  readonly VITE_APP_VERSION: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
