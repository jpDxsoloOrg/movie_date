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
/** Only root fields have resolvers and the site sends one per request. */
const RESOLVER_COUNT_LIMIT = 5;

const ROOT_TYPES = ["Query", "Mutation", "Subscription"];

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
          {
            actions: ["kms:Decrypt"],
            resources: [aws.kms.getKeyOutput({ keyId: "alias/aws/ssm" }).arn],
            conditions: [
              {
                test: "StringEquals",
                variable: "kms:ViaService",
                values: [`ssm.${REGION}.amazonaws.com`],
              },
            ],
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
    ].join("; ")}; img-src 'self' data: blob: https://image.tmdb.org https://media.movieofthenight.com ${avatarHosts}; connect-src 'self' ${api.url} ${realtimeUrl} https://cognito-idp.${REGION}.amazonaws.com ${avatarHosts}`;

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
      site: site.url,
      userPoolClientId: webClient.id,
      userPoolId: userPool.id,
    };
  },
});
