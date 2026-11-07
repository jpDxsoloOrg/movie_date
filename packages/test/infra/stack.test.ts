import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Kind, parse } from "graphql";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Runs the real `run()` from sst.config.ts against recording fakes.
 *
 * A schema field with no resolver deploys cleanly and then answers every call
 * with a null error, and nothing else in the repo executes the infra config, so
 * these assertions are the only thing standing between that and production.
 */
const root = resolve(process.cwd(), "..", "..");

interface ResolverRoute {
  dataSource: string;
  code?: string;
}

interface FunctionPermission {
  actions: string[];
  resources: string[];
}

interface LambdaArgs {
  runtime: string;
  timeout: string;
  link?: unknown[];
  environment: Record<string, string>;
  permissions: FunctionPermission[];
}

interface DataSourceArgs {
  name: string;
  lambda?: LambdaArgs;
}

interface ApiArgs {
  transform: {
    api: {
      authenticationType: string;
      additionalAuthenticationProviders: { authenticationType: string }[];
      queryDepthLimit: number;
      resolverCountLimit: number;
    };
  };
}

interface PoolTransformArgs {
  name?: string;
  passwordPolicy?: { minimumLength: number; requireSymbols: boolean };
}

interface PoolArgs {
  usernames: string[];
  triggers: { preSignUp: { handler: string }; postConfirmation: string };
  transform: { userPool: (args: PoolTransformArgs, opts: ResourceOptions) => void };
}

interface ResourceOptions {
  retainOnDelete?: boolean;
}

interface ClientArgs {
  transform: {
    client: {
      generateSecret: boolean;
      explicitAuthFlows: string[];
      preventUserExistenceErrors: string;
    };
  };
}

interface SiteArgs {
  path: string;
  errorPage?: string;
  environment: Record<string, string>;
  transform: { cdn: (args: { defaultCacheBehavior: Record<string, unknown> }) => void };
}

interface HeadersPolicyArgs {
  securityHeadersConfig: {
    contentSecurityPolicy: { contentSecurityPolicy: string };
    contentTypeOptions: { override: boolean };
    frameOptions: { frameOption: string };
    referrerPolicy: { referrerPolicy: string };
    strictTransportSecurity: { accessControlMaxAgeSec: number };
  };
}

interface Recorded {
  routes: Map<string, ResolverRoute>;
  dataSources: DataSourceArgs[];
  api?: ApiArgs;
  pool?: PoolArgs;
  client?: ClientArgs;
  site?: SiteArgs;
  tableTtl?: string;
  bucketAccess?: string;
  bucketLifecycle?: { prefix: string; expiresIn: string }[];
  postConfirmationHandler?: string;
  rolePolicy?: { role: string; policy: string };
  headersPolicy?: HeadersPolicyArgs;
}

interface StackConfig {
  run(): Promise<unknown>;
}

function interpolate(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((text, part, index) => text + part + String(values[index] ?? ""), "");
}

function fakeResources(recorded: Recorded) {
  return {
    aws: {
      Dynamo: class {
        name = "table-name";
        arn = "arn:table";
        constructor(_name: string, args: { ttl: string }) {
          recorded.tableTtl = args.ttl;
        }
      },
      Bucket: class {
        name = "bucket-name";
        domain = "bucket-name.s3.amazonaws.com";
        arn = "arn:bucket";
        constructor(_name: string, args: Pick<Recorded, "bucketLifecycle"> & { access: string; lifecycle: Recorded["bucketLifecycle"] }) {
          recorded.bucketAccess = args.access;
          recorded.bucketLifecycle = args.lifecycle;
        }
      },
      Function: class {
        arn = "arn:post-confirmation";
        nodes = { role: { name: "post-confirmation-role" } };
        constructor(_name: string, args: { handler: string }) {
          recorded.postConfirmationHandler = args.handler;
        }
      },
      CognitoUserPool: class {
        id = "pool-id";
        arn = "arn:pool";
        constructor(_name: string, args: PoolArgs) {
          recorded.pool = args;
        }
        addClient(_name: string, args: ClientArgs) {
          recorded.client = args;
          return { id: "client-id" };
        }
      },
      AppSync: class {
        url = "https://api.example/graphql";
        nodes = {
          api: { arn: "arn:api", uris: { REALTIME: "wss://realtime.example/graphql" } },
        };
        constructor(_name: string, args: ApiArgs) {
          recorded.api = args;
        }
        addDataSource(args: DataSourceArgs) {
          recorded.dataSources.push(args);
          return { name: args.name };
        }
        addResolver(operation: string, args: ResolverRoute) {
          recorded.routes.set(operation, args);
        }
      },
      StaticSite: class {
        url = "https://site.example";
        constructor(_name: string, args: SiteArgs) {
          recorded.site = args;
        }
      },
    },
  };
}

function fakeAws(recorded: Recorded) {
  return {
    getCallerIdentityOutput: () => ({ accountId: "123456789012" }),
    kms: { getKeyOutput: () => ({ arn: "arn:aws:kms:us-east-1:123456789012:key/ssm" }) },
    iam: {
      RolePolicy: class {
        constructor(_name: string, args: { role: string; policy: string }) {
          recorded.rolePolicy = args;
        }
      },
    },
    cloudfront: {
      ResponseHeadersPolicy: class {
        id = "headers-policy-id";
        constructor(_name: string, args: HeadersPolicyArgs) {
          recorded.headersPolicy = args;
        }
      },
    },
  };
}

async function runStack(config: StackConfig, stage: string): Promise<Recorded> {
  const recorded: Recorded = { routes: new Map(), dataSources: [] };
  vi.stubGlobal("$app", { stage });
  vi.stubGlobal("sst", fakeResources(recorded));
  vi.stubGlobal("aws", fakeAws(recorded));
  await config.run();
  return recorded;
}

function lambdaArgs(recorded: Recorded): LambdaArgs {
  const lambda = recorded.dataSources.find((source) => source.lambda)?.lambda;
  if (!lambda) throw new Error("No Lambda data source was created");
  return lambda;
}

function schemaOperations(): string[] {
  const schema = readFileSync(resolve(root, "graphql/schema.graphql"), "utf8");
  return parse(schema).definitions.flatMap((definition) =>
    definition.kind === Kind.OBJECT_TYPE_DEFINITION &&
    ["Query", "Mutation", "Subscription"].includes(definition.name.value)
      ? (definition.fields ?? []).map((field) => `${definition.name.value} ${field.name.value}`)
      : [],
  );
}

describe("sst.config.ts", () => {
  const publishOperation = "Mutation publishRoomEvent";
  const revokeOperation = "Mutation revokeRoomSubscriptions";
  const subscribeOperation = "Subscription onRoomEvent";
  const passthroughOperations = [publishOperation, revokeOperation];
  let config: StackConfig;
  let production: Recorded;

  beforeAll(async () => {
    vi.stubGlobal("$config", (input: StackConfig) => input);
    vi.stubGlobal("$cli", { paths: { root } });
    vi.stubGlobal("$interpolate", interpolate);
    vi.stubGlobal("$jsonStringify", JSON.stringify);
    vi.stubGlobal("$util", {
      output: <T>(value: T) => ({ apply: <R>(callback: (resolved: T) => R) => callback(value) }),
    });
    ({ default: config } = await import("../../../sst.config"));
    production = await runStack(config, "production");
  });

  // The pool transform reads the stage when it is applied, after run() returns.
  beforeEach(() => {
    vi.stubGlobal("$app", { stage: "production" });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  describe("resolver routes", () => {
    it("routes every schema field and nothing else", () => {
      expect([...production.routes.keys()].sort()).toEqual(schemaOperations().sort());
    });

    it("sends everything but the pass-through fields to the Lambda", () => {
      const lambdaSourceName = production.dataSources.find((source) => source.lambda)?.name;
      for (const operation of schemaOperations()) {
        if (passthroughOperations.includes(operation) || operation === subscribeOperation) continue;
        expect(production.routes.get(operation), operation).toEqual({
          dataSource: lambdaSourceName,
        });
      }
    });

    it("resolves publishRoomEvent locally on a NONE data source", () => {
      const route = production.routes.get(publishOperation);
      const source = production.dataSources.find(({ name }) => name === route?.dataSource);
      expect(source).toBeDefined();
      expect(source?.lambda).toBeUndefined();
      expect(route?.code).toContain("payload: ctx.args.input");
    });

    it("closes a departed member's subscriptions from a NONE data source", () => {
      const route = production.routes.get(revokeOperation);
      const source = production.dataSources.find(({ name }) => name === route?.dataSource);
      expect(source).toBeDefined();
      expect(source?.lambda).toBeUndefined();
      expect(route?.code).toContain("extensions.invalidateSubscriptions");
      expect(route?.code).toContain('subscriptionField: "onRoomEvent"');
    });

    it("checks membership in the Lambda, then filters on the fields the revoke sends", () => {
      const route = production.routes.get(subscribeOperation);
      const lambdaSourceName = production.dataSources.find((source) => source.lambda)?.name;
      expect(route?.dataSource).toBe(lambdaSourceName);
      expect(route?.code).toContain('operation: "Invoke"');
      expect(route?.code).toContain("extensions.setSubscriptionInvalidationFilter");
      expect(route?.code).toContain("roomId: { eq: ctx.args.roomId }");
      expect(route?.code).toContain("userId: { eq: ctx.identity.sub }");
      expect(production.routes.get(revokeOperation)?.code).toContain(
        "payload: { roomId: ctx.args.roomId, userId: ctx.args.userId }",
      );
    });

    it("has a handler in the Lambda's router for every field the Lambda receives", () => {
      const router = readFileSync(resolve(root, "packages/functions/src/resolver.ts"), "utf8");
      const table = router.split("const handlers: HandlerTable = {")[1]?.split("};")[0] ?? "";
      const handled = [...table.matchAll(/^\s*(\w+)[,:]/gm)].map((match) => match[1]);
      const lambdaFields = schemaOperations()
        .filter((operation) => !passthroughOperations.includes(operation))
        .map((operation) => operation.split(" ")[1]);
      expect(handled).toEqual(expect.arrayContaining(lambdaFields));
    });
  });

  describe("API auth", () => {
    it("defaults to Cognito with IAM as the only other provider", () => {
      const api = production.api?.transform.api;
      expect(api?.authenticationType).toBe("AMAZON_COGNITO_USER_POOLS");
      expect(api?.additionalAuthenticationProviders).toEqual([{ authenticationType: "AWS_IAM" }]);
    });

    it("caps how much one request can fan out", () => {
      const api = production.api?.transform.api;
      expect(api?.resolverCountLimit).toBeGreaterThan(0);
      expect(api?.queryDepthLimit).toBeGreaterThan(0);
    });
  });

  describe("resolver Lambda", () => {
    it("runs on node 20 or newer within AppSync's 30 second limit", () => {
      const lambda = lambdaArgs(production);
      expect(Number(/^nodejs(\d+)\.x$/.exec(lambda.runtime)?.[1])).toBeGreaterThanOrEqual(20);
      expect(Number.parseInt(lambda.timeout, 10)).toBeLessThanOrEqual(30);
    });

    it("grants named actions only, with no link to bring back dynamodb:* and s3:*", () => {
      const lambda = lambdaArgs(production);
      expect(lambda.link).toBeUndefined();
      const actions = lambda.permissions.flatMap((permission) => permission.actions);
      expect(actions.filter((action) => action.includes("*"))).toEqual([]);
      expect(actions).toEqual(
        expect.arrayContaining(["dynamodb:Query", "dynamodb:ConditionCheckItem", "s3:PutObject"]),
      );
    });

    it("can reach exactly the paths avatars use", () => {
      const resources = lambdaArgs(production)
        .permissions.filter(({ actions }) => actions.some((action) => action.startsWith("s3:")))
        .flatMap((permission) => permission.resources);
      expect(resources.sort()).toEqual(["arn:bucket", "arn:bucket/avatars/*", "arn:bucket/pending/*"]);
    });

    it("may only call the backend's own fields on the API", () => {
      const permission = lambdaArgs(production).permissions.find(({ actions }) =>
        actions.includes("appsync:GraphQL"),
      );
      expect(permission?.resources).toEqual([
        "arn:api/types/Mutation/fields/publishRoomEvent",
        "arn:api/types/Mutation/fields/revokeRoomSubscriptions",
      ]);
    });

    it("binds the secrets by parameter name per stage", async () => {
      const staging = await runStack(config, "staging");
      expect(lambdaArgs(production).environment).toMatchObject({
        TMDB_KEY_PARAM: "/movie-date/production/tmdb-api-key",
        RAPIDAPI_KEY_PARAM: "/movie-date/production/rapidapi-key",
      });
      expect(lambdaArgs(staging).environment.TMDB_KEY_PARAM).toBe(
        "/movie-date/staging/tmdb-api-key",
      );
    });

    it("may read only those two parameters", () => {
      const permission = lambdaArgs(production).permissions.find(({ actions }) =>
        actions.includes("ssm:GetParameter"),
      );
      expect(permission?.resources).toEqual([
        "arn:aws:ssm:us-east-1:123456789012:parameter/movie-date/production/tmdb-api-key",
        "arn:aws:ssm:us-east-1:123456789012:parameter/movie-date/production/rapidapi-key",
      ]);
    });
  });

  describe("user pool", () => {
    function applyPoolTransform(recorded: Recorded) {
      const args: PoolTransformArgs = {};
      const opts: ResourceOptions = {};
      recorded.pool?.transform.userPool(args, opts);
      return { args, opts };
    }

    it("matches the old password rules", () => {
      const { args } = applyPoolTransform(production);
      expect(args.name).toBe("movie-date-production");
      expect(args.passwordPolicy).toMatchObject({ minimumLength: 6, requireSymbols: false });
    });

    it("is retained on production only", async () => {
      const staging = await runStack(config, "staging");
      expect(applyPoolTransform(production).opts.retainOnDelete).toBe(true);
      expect(applyPoolTransform(staging).opts.retainOnDelete).toBe(false);
    });

    it("signs up by email through the PreSignUp trigger", () => {
      expect(production.pool?.usernames).toEqual(["email"]);
      expect(production.pool?.triggers.preSignUp.handler).toBe(
        "packages/functions/src/preSignUp.handler",
      );
    });

    it("ends a reset user's sessions, with a grant on this pool alone", () => {
      expect(production.postConfirmationHandler).toBe("packages/functions/src/postConfirmation.handler");
      expect(production.pool?.triggers.postConfirmation).toBe("arn:post-confirmation");
      expect(production.rolePolicy?.role).toBe("post-confirmation-role");
      expect(JSON.parse(production.rolePolicy?.policy ?? "{}")).toMatchObject({
        Statement: [{ Action: ["cognito-idp:AdminUserGlobalSignOut"], Resource: ["arn:pool"] }],
      });
    });

    it("doesn't tell raw API callers which emails exist", () => {
      expect(production.client?.transform.client.preventUserExistenceErrors).toBe("ENABLED");
    });

    it("gives the site a secretless SRP client", () => {
      expect(production.client?.transform.client).toMatchObject({
        generateSecret: false,
        explicitAuthFlows: ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
      });
    });
  });

  describe("storage", () => {
    it("expires cache rows on expiresAt", () => {
      expect(production.tableTtl).toBe("expiresAt");
    });

    it("serves avatars publicly", () => {
      expect(production.bucketAccess).toBe("public");
    });

    it("clears uploads that never became avatars, and nothing else", () => {
      expect(production.bucketLifecycle).toMatchObject([{ prefix: "pending/", expiresIn: "1 day" }]);
    });
  });

  describe("site", () => {
    it("builds with everything the frontend reads", () => {
      expect(production.site?.path).toBe("packages/frontend");
      expect(production.site?.environment).toEqual({
        VITE_GRAPHQL_URL: "https://api.example/graphql",
        VITE_GRAPHQL_REALTIME_URL: "wss://realtime.example/graphql",
        VITE_USER_POOL_ID: "pool-id",
        VITE_USER_POOL_CLIENT_ID: "client-id",
      });
    });

    it("sends the security headers from the site's default behaviour", () => {
      const args = { defaultCacheBehavior: { targetOriginId: "default" } as Record<string, unknown> };
      production.site?.transform.cdn(args);
      expect(args.defaultCacheBehavior).toEqual({
        targetOriginId: "default",
        responseHeadersPolicyId: "headers-policy-id",
      });
      const headers = production.headersPolicy?.securityHeadersConfig;
      expect(headers?.frameOptions.frameOption).toBe("DENY");
      expect(headers?.contentTypeOptions.override).toBe(true);
      expect(headers?.strictTransportSecurity.accessControlMaxAgeSec).toBeGreaterThan(0);
    });

    it("limits the CSP to the hosts the site really uses", () => {
      const policy = production.headersPolicy?.securityHeadersConfig.contentSecurityPolicy.contentSecurityPolicy;
      const directive = (name: string) => policy?.split("; ").find((part) => part.startsWith(`${name} `));
      expect(directive("script-src")).toBe("script-src 'self'");
      expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
      expect(directive("frame-src")).toBe("frame-src https://www.youtube-nocookie.com");
      expect(directive("connect-src")).toContain("https://api.example/graphql");
      expect(directive("connect-src")).toContain("wss://realtime.example/graphql");
      expect(directive("connect-src")).toContain("https://cognito-idp.us-east-1.amazonaws.com");
      expect(directive("connect-src")).toContain("https://bucket-name.s3.us-east-1.amazonaws.com");
      expect(directive("img-src")).toContain("https://image.tmdb.org");
      expect(directive("img-src")).toContain("https://bucket-name.s3.amazonaws.com");
      expect(directive("img-src")).not.toMatch(/ https: /);
    });

    it("leaves errorPage unset so client routes fall back to index.html", () => {
      expect(production.site?.errorPage).toBeUndefined();
    });
  });
});
