/** Built in by sst.config.ts from the stack's outputs, so a deploy can't point at the wrong stage. */
export interface AppConfig {
  graphqlUrl: string;
  realtimeUrl: string;
  userPoolId: string;
  userPoolClientId: string;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. The site is built with it by sst.config.ts; for a local ` +
        `dev server put it in packages/frontend/.env.local.`,
    );
  }
  return value;
}

let override: AppConfig | undefined;

/** Point the client somewhere else. Tests use this; nothing else should. */
export function setAppConfig(config: AppConfig | undefined): void {
  override = config;
}

export function appConfig(): AppConfig {
  if (override) return override;
  const env = import.meta.env;
  const graphqlUrl = required("VITE_GRAPHQL_URL", env.VITE_GRAPHQL_URL);
  return {
    graphqlUrl,
    realtimeUrl:
      env.VITE_GRAPHQL_REALTIME_URL ??
      graphqlUrl
        .replace("appsync-api", "appsync-realtime-api")
        .replace(/^http/, "ws"),
    userPoolId: required("VITE_USER_POOL_ID", env.VITE_USER_POOL_ID),
    userPoolClientId: required("VITE_USER_POOL_CLIENT_ID", env.VITE_USER_POOL_CLIENT_ID),
  };
}
