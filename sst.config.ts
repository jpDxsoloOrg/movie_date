/// <reference path="./.sst/platform/config.d.ts" />

const REGION = "us-east-1";
const RUNTIME = "nodejs22.x";

/** AppSync's own resolver timeout, so a longer Lambda timeout would buy nothing. */
const RESOLVER_TIMEOUT = "30 seconds";

/** The one field that never reaches the Lambda: it only fans out to subscribers. */
const PUBLISH_FIELD = "publishRoomEvent";

const ROOT_TYPES = ["Query", "Mutation", "Subscription"];

const PUBLISH_RESOLVER_CODE = `
export function request(ctx) {
  return { payload: ctx.args.input };
}

export function response(ctx) {
  return ctx.result;
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
    });

    const userPool = new sst.aws.CognitoUserPool("Users", {
      usernames: ["email"],
      triggers: {
        preSignUp: {
          handler: "packages/functions/src/preSignUp.handler",
          runtime: RUNTIME,
        },
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

    const webClient = userPool.addClient("Web", {
      transform: {
        client: {
          generateSecret: false,
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
        link: [table, avatars],
        // `link` grants the IAM, but its names reach the runtime through SST's
        // SDK; the handlers read plain environment variables instead.
        environment: {
          TABLE_NAME: table.name,
          AVATARS_BUCKET: avatars.name,
          GRAPHQL_URL: api.url,
          TMDB_KEY_PARAM: tmdbKeyParam,
          RAPIDAPI_KEY_PARAM: rapidApiKeyParam,
        },
        permissions: [
          {
            actions: ["appsync:GraphQL"],
            resources: [
              $interpolate`${api.nodes.api.arn}/types/Mutation/fields/${PUBLISH_FIELD}`,
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
        } else {
          api.addResolver(operation, { dataSource: lambdaSource.name });
        }
      }
    }

    const realtimeUrl = api.nodes.api.uris["REALTIME"];

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
