/// <reference path="./.sst/platform/config.d.ts" />

const REGION = "us-east-1";
const RUNTIME = "nodejs22.x";

/** AppSync's own resolver timeout, so a longer Lambda timeout would buy nothing. */
const RESOLVER_TIMEOUT = "30 seconds";

/** Fields that never reach the Lambda: they only act on subscribers. */
const PUBLISH_FIELD = "publishRoomEvent";
const REVOKE_FIELD = "revokeRoomSubscriptions";
const SUBSCRIBE_FIELD = "onRoomEvent";

/** The deepest operation the site sends is well inside this. */
const QUERY_DEPTH_LIMIT = 10;
/**
 * Only root fields have resolvers and every operation in the site has one. Aliases
 * count, so this is also what stops one request carrying several deck walks.
 */
const RESOLVER_COUNT_LIMIT = 1;

const ROOT_TYPES = ["Query", "Mutation", "Subscription"];

/** Plex Request's private function. The env var and the IAM grant both come from this. */
const PLEX_INTEGRATION_FUNCTION = "plex-request-api-devtest-integration";
const MAIL_DOMAIN = "jpdxsolo.com";
const SITE_DOMAIN = `moviedate.${MAIL_DOMAIN}`;
const MAIL_FROM = `noreply@${MAIL_DOMAIN}`;

// Served as /sw.js on the old cloudfront.net address. An installed copy of the app
// loads pages from its own cache and never sees a redirect, but it does fetch
// /sw.js to check for updates, and a redirected worker script fails that check.
// This worker takes over, clears the cache, and reloads each window so the
// redirect below reaches it.
const RETIRE_SERVICE_WORKER = `self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",e=>e.waitUntil((async()=>{await self.registration.unregister();for(const k of await caches.keys())await caches.delete(k);for(const c of await self.clients.matchAll({type:"window"}))c.navigate(c.url)})()));`;

// Runs before SST's own check, which would answer the cloudfront.net address with
// a 403. Sends it to the custom domain instead, keeping the path and query.
const LEGACY_HOST_REDIRECT = `
if (event.request.headers.host.value.includes("cloudfront.net")) {
  var legacy = event.request;
  if (legacy.uri === "/sw.js") {
    return {
      statusCode: 200,
      statusDescription: "OK",
      headers: { "content-type": { value: "text/javascript" }, "cache-control": { value: "no-cache" } },
      body: { encoding: "text", data: ${JSON.stringify(RETIRE_SERVICE_WORKER)} },
    };
  }
  var query = [];
  for (var key in legacy.querystring) {
    var entry = legacy.querystring[key];
    (entry.multiValue || [entry]).forEach(function (item) {
      query.push(item.value ? key + "=" + item.value : key);
    });
  }
  return {
    statusCode: 301,
    statusDescription: "Moved Permanently",
    headers: { location: { value: "https://${SITE_DOMAIN}" + legacy.uri + (query.length ? "?" + query.join("&") : "") } },
  };
}`;
/** Partition key of the job's lease, the only row it may touch. */
const PLEX_INDEX_PK = "PLEX#INDEX";

/** The trailer player hands the browser this artwork for its media controls, under this page's CSP. */
const TRAILER_ARTWORK_HOST = "https://i.ytimg.com";

const PUBLISH_RESOLVER_CODE = `
export function request(ctx) {
  return { payload: ctx.args.input };
}

export function response(ctx) {
  return ctx.result;
}
`;

/** A subscription's invalidation filter can only be set from a resolver, not a direct Lambda. */
const SUBSCRIBE_RESOLVER_CODE = `
import { extensions, util } from "@aws-appsync/utils";

export function request(ctx) {
  return {
    operation: "Invoke",
    payload: {
      arguments: ctx.args,
      identity: ctx.identity,
      info: { fieldName: ctx.info.fieldName, parentTypeName: ctx.info.parentTypeName },
    },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  extensions.setSubscriptionInvalidationFilter(
    util.transform.toSubscriptionFilter({
      roomId: { eq: ctx.args.roomId },
      userId: { eq: ctx.identity.sub },
    }),
  );
  return ctx.result;
}
`;

const REVOKE_RESOLVER_CODE = `
import { extensions } from "@aws-appsync/utils";

export function request(ctx) {
  return { payload: null };
}

export function response(ctx) {
  extensions.invalidateSubscriptions({
    subscriptionField: "${SUBSCRIBE_FIELD}",
    payload: { roomId: ctx.args.roomId, userId: ctx.args.userId },
  });
  return true;
}
`;

export default $config({
  app(input) {
    return {
      name: "movie-date",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: { aws: { region: REGION } },
    };
  },
  async run() {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { Kind, parse } = await import("graphql");

    const isProduction = $app.stage === "production";
    const schemaPath = join($cli.paths.root, "graphql/schema.graphql");

    const table = new sst.aws.Dynamo("Table", {
      fields: { pk: "string", sk: "string" },
      primaryIndex: { hashKey: "pk", rangeKey: "sk" },
      ttl: "expiresAt",
    });

    const avatars = new sst.aws.Bucket("Avatars", {
      access: "public",
      // Naming the site's origin here would be a cycle, because the site's build
      // environment needs this bucket. Uploads are gated by the presigned POST
      // policy, not by CORS.
      cors: {
        allowHeaders: ["*"],
        allowMethods: ["GET", "HEAD", "POST"],
        allowOrigins: ["*"],
      },
      // Uploads wait here until updateProfile checks and promotes them.
      lifecycle: [{ id: "expire-pending-avatars", prefix: "pending/", expiresIn: "1 day" }],
    });

    // Private, unlike avatars: this lists what's on the owner's server.
    const plexLibrary = new sst.aws.Bucket("PlexLibrary");

    // Its own resource, so its policy can name the pool: an inline grant would be a
    // cycle, because the pool needs this function's ARN.
    const postConfirmation = new sst.aws.Function("PostConfirmation", {
      handler: "packages/functions/src/postConfirmation.handler",
      runtime: RUNTIME,
    });

    const userPool = new sst.aws.CognitoUserPool("Users", {
      usernames: ["email"],
      triggers: {
        preSignUp: {
          handler: "packages/functions/src/preSignUp.handler",
          runtime: RUNTIME,
        },
        postConfirmation: postConfirmation.arn,
      },
      transform: {
        userPool: (args, opts) => {
          args.name = `movie-date-${$app.stage}`;
          args.passwordPolicy = {
            minimumLength: 6,
            requireLowercase: false,
            requireNumbers: false,
            requireSymbols: false,
            requireUppercase: false,
            temporaryPasswordValidityDays: 7,
          };
          args.accountRecoverySetting = {
            recoveryMechanisms: [{ name: "verified_email", priority: 1 }],
          };
          // The app's "retain" removal mode covers buckets and tables but not
          // user pools, and losing the pool would lock everyone out.
          opts.retainOnDelete = isProduction;
        },
      },
    });

    new aws.iam.RolePolicy("PostConfirmationSignOut", {
      role: postConfirmation.nodes.role.name,
      policy: $jsonStringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["cognito-idp:AdminUserGlobalSignOut"],
            Resource: [userPool.arn],
          },
        ],
      }),
    });

    const webClient = userPool.addClient("Web", {
      transform: {
        client: {
          generateSecret: false,
          // Login and forgot password answer the same for unknown emails. Sign-up
          // can't: it has to refuse a taken email.
          preventUserExistenceErrors: "ENABLED",
          explicitAuthFlows: ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
          // SST defaults to hosted-UI OAuth with a placeholder callback URL; the
          // site signs in over SRP and never uses it.
          allowedOauthFlowsUserPoolClient: false,
          allowedOauthFlows: undefined,
          allowedOauthScopes: undefined,
          callbackUrls: undefined,
        },
      },
    });

    const api = new sst.aws.AppSync("Api", {
      schema: schemaPath,
      transform: {
        api: {
          authenticationType: "AMAZON_COGNITO_USER_POOLS",
          userPoolConfig: {
            awsRegion: REGION,
            defaultAction: "ALLOW",
            userPoolId: userPool.id,
          },
          additionalAuthenticationProviders: [{ authenticationType: "AWS_IAM" }],
          queryDepthLimit: QUERY_DEPTH_LIMIT,
          resolverCountLimit: RESOLVER_COUNT_LIMIT,
        },
      },
    });

    const accountId = aws.getCallerIdentityOutput({}).accountId;
    const parameterName = (key: string) => `/movie-date/${$app.stage}/${key}`;
    const parameterArn = (name: string) =>
      $interpolate`arn:aws:ssm:${REGION}:${accountId}:parameter${name}`;
    const tmdbKeyParam = parameterName("tmdb-api-key");
    const rapidApiKeyParam = parameterName("rapidapi-key");
    const invokePlexRequest = {
      actions: ["lambda:InvokeFunction"],
      resources: [
        $interpolate`arn:aws:lambda:${REGION}:${accountId}:function:${PLEX_INTEGRATION_FUNCTION}`,
      ],
    };
    const decryptParameters = {
      actions: ["kms:Decrypt"],
      resources: [aws.kms.getKeyOutput({ keyId: "alias/aws/ssm" }).arn],
      conditions: [
        {
          test: "StringEquals",
          variable: "kms:ViaService",
          values: [`ssm.${REGION}.amazonaws.com`],
        },
      ],
    };

    const lambdaSource = api.addDataSource({
      name: "lambda",
      lambda: {
        handler: "packages/functions/src/resolver.handler",
        runtime: RUNTIME,
        timeout: RESOLVER_TIMEOUT,
        // A deck page hydrates up to 100 movies; Lambda CPU scales with memory.
        memory: "1024 MB",
        // Not `link`, which grants dynamodb:* and s3:*. The handlers read these names
        // from plain environment variables and the permissions below are the IAM.
        environment: {
          TABLE_NAME: table.name,
          AVATARS_BUCKET: avatars.name,
          GRAPHQL_URL: api.url,
          TMDB_KEY_PARAM: tmdbKeyParam,
          RAPIDAPI_KEY_PARAM: rapidApiKeyParam,
          PLEX_INTEGRATION_FUNCTION,
          PLEX_INDEX_BUCKET: plexLibrary.name,
          MAIL_FROM,
        },
        permissions: [
          {
            // Everything lib/db.ts sends. Transactions authorise per item.
            actions: [
              "dynamodb:GetItem",
              "dynamodb:PutItem",
              "dynamodb:UpdateItem",
              "dynamodb:DeleteItem",
              "dynamodb:ConditionCheckItem",
              "dynamodb:Query",
            ],
            resources: [table.arn],
          },
          {
            // Without this a missing key reads as AccessDenied instead of NoSuchKey.
            actions: ["s3:ListBucket"],
            resources: [avatars.arn],
          },
          {
            // A presigned POST carries its signer's rights, so uploads need PutObject.
            actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
            resources: [$interpolate`${avatars.arn}/pending/*`],
          },
          {
            actions: ["s3:PutObject", "s3:DeleteObject"],
            resources: [$interpolate`${avatars.arn}/avatars/*`],
          },
          {
            actions: ["appsync:GraphQL"],
            resources: [
              $interpolate`${api.nodes.api.arn}/types/Mutation/fields/${PUBLISH_FIELD}`,
              $interpolate`${api.nodes.api.arn}/types/Mutation/fields/${REVOKE_FIELD}`,
            ],
          },
          {
            actions: ["ssm:GetParameter"],
            resources: [parameterArn(tmdbKeyParam), parameterArn(rapidApiKeyParam)],
          },
          decryptParameters,
          invokePlexRequest,
          {
            // SES authorises against the verified domain, so the address needs the condition.
            actions: ["ses:SendEmail"],
            resources: [$interpolate`arn:aws:ses:${REGION}:${accountId}:identity/${MAIL_DOMAIN}`],
            conditions: [{ test: "StringEquals", variable: "ses:FromAddress", values: [MAIL_FROM] }],
          },
          {
            // Without this a missing index reads as AccessDenied instead of NoSuchKey.
            actions: ["s3:ListBucket"],
            resources: [plexLibrary.arn],
          },
          {
            actions: ["s3:GetObject"],
            resources: [$interpolate`${plexLibrary.arn}/*`],
          },
        ],
      },
    });

    // Runs by hand too: `aws lambda invoke` on the plexIndexFunction output.
    const plexIndexJob = new sst.aws.Cron("PlexIndexJob", {
      schedule: "rate(6 hours)",
      function: {
        handler: "packages/functions/src/plexIndexJob.handler",
        runtime: RUNTIME,
        timeout: "15 minutes",
        memory: "512 MB",
        // A rerun of a failed job would fail the same way, and the next one is 6 hours off.
        retries: 0,
        environment: {
          TABLE_NAME: table.name,
          TMDB_KEY_PARAM: tmdbKeyParam,
          PLEX_INTEGRATION_FUNCTION,
          PLEX_INDEX_BUCKET: plexLibrary.name,
        },
        permissions: [
          {
            actions: ["dynamodb:UpdateItem", "dynamodb:DeleteItem"],
            resources: [table.arn],
            conditions: [
              {
                test: "ForAllValues:StringEquals",
                variable: "dynamodb:LeadingKeys",
                values: [PLEX_INDEX_PK],
              },
            ],
          },
          {
            actions: ["ssm:GetParameter"],
            resources: [parameterArn(tmdbKeyParam)],
          },
          decryptParameters,
          invokePlexRequest,
          {
            actions: ["s3:ListBucket"],
            resources: [plexLibrary.arn],
          },
          {
            actions: ["s3:GetObject", "s3:PutObject"],
            resources: [$interpolate`${plexLibrary.arn}/*`],
          },
        ],
      },
    });

    // No `lambda` makes this a NONE data source, so publishing costs no invocation
    // and cannot loop back through the function that called it.
    const passthroughSource = api.addDataSource({ name: "passthrough" });

    for (const definition of parse(readFileSync(schemaPath, "utf8")).definitions) {
      if (definition.kind !== Kind.OBJECT_TYPE_DEFINITION) continue;
      if (!ROOT_TYPES.includes(definition.name.value)) continue;

      for (const field of definition.fields ?? []) {
        const operation = `${definition.name.value} ${field.name.value}`;
        if (field.name.value === PUBLISH_FIELD) {
          api.addResolver(operation, {
            dataSource: passthroughSource.name,
            code: PUBLISH_RESOLVER_CODE,
          });
        } else if (field.name.value === REVOKE_FIELD) {
          api.addResolver(operation, {
            dataSource: passthroughSource.name,
            code: REVOKE_RESOLVER_CODE,
          });
        } else if (field.name.value === SUBSCRIBE_FIELD) {
          api.addResolver(operation, {
            dataSource: lambdaSource.name,
            code: SUBSCRIBE_RESOLVER_CODE,
          });
        } else {
          api.addResolver(operation, { dataSource: lambdaSource.name });
        }
      }
    }

    const realtimeUrl = api.nodes.api.uris["REALTIME"];

    // Avatars are served from the global endpoint and uploaded to the regional one.
    const avatarHosts = $interpolate`https://${avatars.name}.s3.amazonaws.com https://${avatars.name}.s3.${REGION}.amazonaws.com`;
    const contentSecurityPolicy = $interpolate`${[
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "frame-src https://www.youtube-nocookie.com",
      "worker-src 'self'",
      "manifest-src 'self'",
    ].join("; ")}; img-src 'self' data: blob: https://image.tmdb.org https://media.movieofthenight.com ${TRAILER_ARTWORK_HOST} ${avatarHosts}; connect-src 'self' ${api.url} ${realtimeUrl} https://cognito-idp.${REGION}.amazonaws.com ${avatarHosts}`;

    const securityHeaders = new aws.cloudfront.ResponseHeadersPolicy("SecurityHeaders", {
      name: `movie-date-${$app.stage}-security`,
      securityHeadersConfig: {
        contentSecurityPolicy: { contentSecurityPolicy, override: true },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: "DENY", override: true },
        referrerPolicy: { referrerPolicy: "strict-origin-when-cross-origin", override: true },
        strictTransportSecurity: {
          accessControlMaxAgeSec: 63_072_000,
          includeSubdomains: true,
          override: true,
        },
      },
    });

    // errorPage stays unset: that is what makes SST serve index.html with a 200 for
    // client-side routes, where setting it would answer them with a 404.
    const site = new sst.aws.StaticSite("Site", {
      path: "packages/frontend",
      // DNS for jpdxsolo.com is outside AWS, so the CNAME is added by hand and
      // the existing wildcard certificate is looked up rather than created.
      domain: {
        name: SITE_DOMAIN,
        dns: false,
        cert: aws.acm.getCertificateOutput({ domain: "*.jpdxsolo.com", statuses: ["ISSUED"], mostRecent: true }).arn,
      },
      edge: { viewerRequest: { injection: LEGACY_HOST_REDIRECT } },
      build: { command: "npm run build", output: "dist" },
      assets: {
        // Later entries win. SST's default marks everything but HTML immutable for
        // a year, which would pin the unhashed service worker and web manifest and
        // stop PWA updates from ever arriving.
        fileOptions: [
          { files: "**", cacheControl: "max-age=0,must-revalidate" },
          { files: "assets/**", cacheControl: "max-age=31536000,public,immutable" },
        ],
      },
      transform: {
        cdn: (args) => {
          args.defaultCacheBehavior = $util.output(args.defaultCacheBehavior).apply((behavior) => ({
            ...behavior,
            responseHeadersPolicyId: securityHeaders.id,
          }));
        },
      },
      environment: {
        VITE_GRAPHQL_URL: api.url,
        VITE_GRAPHQL_REALTIME_URL: realtimeUrl,
        VITE_USER_POOL_ID: userPool.id,
        VITE_USER_POOL_CLIENT_ID: webClient.id,
      },
    });

    return {
      api: api.url,
      apiRealtime: realtimeUrl,
      avatarsBucket: avatars.name,
      plexIndexFunction: plexIndexJob.nodes.function.name,
      site: site.url,
      userPoolClientId: webClient.id,
      userPoolId: userPool.id,
    };
  },
});
