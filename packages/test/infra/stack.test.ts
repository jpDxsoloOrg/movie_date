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

interface PermissionCondition {
  test: string;
  variable: string;
  values: string[];
}

interface FunctionPermission {
  actions: string[];
  resources: string[];
  conditions?: PermissionCondition[];
}

interface LambdaArgs {
  runtime: string;
  timeout: string;
  link?: unknown[];
  environment: Record<string, string>;
  permissions: FunctionPermission[];
}

interface CronArgs {
  schedule: string;
  function: LambdaArgs & { handler: string; retries: number; concurrency?: unknown };
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
  domain?: { name: string; dns: false; cert: string };
  edge?: { viewerRequest?: { injection: string } };
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
  privateBuckets: string[];
  cron?: CronArgs;
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
        constructor(
          name: string,
          args?: Pick<Recorded, "bucketLifecycle"> & { access: string; lifecycle: Recorded["bucketLifecycle"] },
        ) {
          if (!args?.access) {
            recorded.privateBuckets.push(name);
            this.name = "plex-library-name";
            this.arn = "arn:plex-library";
            return;
          }
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
      Cron: class {
        nodes = { function: { name: "plex-index-function" } };
        constructor(_name: string, args: CronArgs) {
          recorded.cron = args;
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
    acm: {
      getCertificateOutput: (args: { domain: string }) => ({
        arn: `arn:aws:acm:us-east-1:123456789012:certificate/${args.domain}`,
      }),
    },
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
  const recorded: Recorded = { routes: new Map(), dataSources: [], privateBuckets: [] };
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

function cronArgs(recorded: Recorded): CronArgs {
  if (!recorded.cron) throw new Error("No cron was created");
  return recorded.cron;
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
      expect(api?.resolverCountLimit).toBe(1);
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
        .flatMap((permission) => permission.resources)
        .filter((resource) => resource.startsWith("arn:bucket"));
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

  describe("Plex permissions", () => {
    const integrationArn =
      "arn:aws:lambda:us-east-1:123456789012:function:plex-request-api-devtest-integration";

    function grantsOf(permissions: FunctionPermission[], action: string): FunctionPermission[] {
      return permissions.filter((permission) => permission.actions.includes(action));
    }

    it("may invoke only the Plex Request integration function", () => {
      const lambda = lambdaArgs(production);
      for (const permissions of [lambda.permissions, cronArgs(production).function.permissions]) {
        expect(grantsOf(permissions, "lambda:InvokeFunction")).toEqual([
          { actions: ["lambda:InvokeFunction"], resources: [integrationArn] },
        ]);
      }
    });

    it("names the function once, for both the code and the grant", () => {
      const functionName = integrationArn.split(":").at(-1);
      expect(lambdaArgs(production).environment.PLEX_INTEGRATION_FUNCTION).toBe(functionName);
      expect(cronArgs(production).function.environment.PLEX_INTEGRATION_FUNCTION).toBe(functionName);
      const config = readFileSync(resolve(root, "sst.config.ts"), "utf8");
      expect(config.split(functionName ?? "")).toHaveLength(2);
    });

    it("may send mail only as noreply@jpdxsolo.com", () => {
      const lambda = lambdaArgs(production);
      expect(lambda.environment.MAIL_FROM).toBe("noreply@jpdxsolo.com");
      expect(grantsOf(lambda.permissions, "ses:SendEmail")).toEqual([
        {
          actions: ["ses:SendEmail"],
          resources: ["arn:aws:ses:us-east-1:123456789012:identity/jpdxsolo.com"],
          conditions: [
            { test: "StringEquals", variable: "ses:FromAddress", values: ["noreply@jpdxsolo.com"] },
          ],
        },
      ]);
      expect(grantsOf(cronArgs(production).function.permissions, "ses:SendEmail")).toEqual([]);
    });

    it("keeps the index in a private bucket that only the job writes", () => {
      expect(production.privateBuckets).toEqual(["PlexLibrary"]);
      const lambda = lambdaArgs(production);
      const job = cronArgs(production).function;
      expect(lambda.environment.PLEX_INDEX_BUCKET).toBe("plex-library-name");
      expect(job.environment.PLEX_INDEX_BUCKET).toBe("plex-library-name");
      const reads = grantsOf(lambda.permissions, "s3:GetObject").flatMap((grant) => grant.resources);
      expect(reads).toContain("arn:plex-library/*");
      const writes = grantsOf(lambda.permissions, "s3:PutObject").flatMap((grant) => grant.resources);
      expect(writes).not.toContain("arn:plex-library/*");
      expect(grantsOf(job.permissions, "s3:PutObject").flatMap((grant) => grant.resources)).toEqual([
        "arn:plex-library/*",
      ]);
    });

    it("runs the job every 6 hours, once, without reserving concurrency", () => {
      const { function: job, schedule } = cronArgs(production);
      expect(schedule).toBe("rate(6 hours)");
      expect(job.handler).toBe("packages/functions/src/plexIndexJob.handler");
      expect(job.retries).toBe(0);
      // The account limit of 10 leaves nothing to reserve, so this would fail the deploy.
      expect(job.concurrency).toBeUndefined();
    });

    it("confines the job's table access to its lease", () => {
      const job = cronArgs(production).function;
      const tableGrants = job.permissions.filter((grant) =>
        grant.actions.some((action) => action.startsWith("dynamodb:")),
      );
      expect(tableGrants).toHaveLength(1);
      expect(tableGrants[0]?.conditions).toEqual([
        {
          test: "ForAllValues:StringEquals",
          variable: "dynamodb:LeadingKeys",
          values: ["PLEX#INDEX"],
        },
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

  describe("old cloudfront.net address", () => {
    interface EdgeResponse {
      statusCode: number;
      headers: Record<string, { value: string }>;
      body?: { data: string };
    }
    type Query = Record<string, { value: string; multiValue?: { value: string }[] }>;

    function viewerRequest(host: string, uri: string, querystring: Query = {}): EdgeResponse | undefined {
      const injection = production.site?.edge?.viewerRequest?.injection ?? "";
      const handler = new Function("event", injection) as (event: unknown) => EdgeResponse | undefined;
      return handler({ request: { uri, querystring, headers: { host: { value: host } } } });
    }

    it("redirects to the custom domain, keeping the path and query", () => {
      const response = viewerRequest("d19oka7lgeykfv.cloudfront.net", "/join/ABC234", {
        ref: { value: "share" },
        tag: { value: "a", multiValue: [{ value: "a" }, { value: "b" }] },
      });
      expect(response?.statusCode).toBe(301);
      expect(response?.headers.location.value).toBe(
        "https://moviedate.jpdxsolo.com/join/ABC234?ref=share&tag=a&tag=b",
      );
    });

    it("redirects a bare path without a stray question mark", () => {
      expect(viewerRequest("d19oka7lgeykfv.cloudfront.net", "/")?.headers.location.value).toBe(
        "https://moviedate.jpdxsolo.com/",
      );
    });

    it("serves a worker that retires installed copies instead of redirecting sw.js", () => {
      const response = viewerRequest("d19oka7lgeykfv.cloudfront.net", "/sw.js");
      expect(response?.statusCode).toBe(200);
      expect(response?.headers["content-type"].value).toBe("text/javascript");
      const script = response?.body?.data ?? "";
      expect(script).toContain("registration.unregister()");
      expect(script).toContain("caches.delete");
      expect(() => new Function(script)).not.toThrow();
    });

    it("leaves the custom domain alone", () => {
      expect(viewerRequest("moviedate.jpdxsolo.com", "/sw.js")).toBeUndefined();
      expect(viewerRequest("moviedate.jpdxsolo.com", "/")).toBeUndefined();
    });
  });

  describe("site", () => {
    it("serves the custom domain on the wildcard certificate, leaving DNS to the owner", () => {
      expect(production.site?.domain).toEqual({
        name: "moviedate.jpdxsolo.com",
        dns: false,
        cert: "arn:aws:acm:us-east-1:123456789012:certificate/*.jpdxsolo.com",
      });
    });

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
      expect(directive("img-src")).toContain("https://i.ytimg.com");
      expect(directive("img-src")).not.toMatch(/ https: /);
    });

    it("leaves errorPage unset so client routes fall back to index.html", () => {
      expect(production.site?.errorPage).toBeUndefined();
    });
  });
});
