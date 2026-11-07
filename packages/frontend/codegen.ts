import type { CodegenConfig } from "@graphql-codegen/cli";

/**
 * `documentMode: "string"` emits each operation as a branded string, which keeps
 * the `graphql` parser out of the bundle: the client POSTs the string as-is.
 */
const config: CodegenConfig = {
  schema: ["../../graphql/schema.graphql", "appsync.graphql"],
  documents: ["src/**/*.ts", "src/**/*.tsx", "!src/gql/**"],
  ignoreNoDocuments: true,
  generates: {
    "src/gql/": {
      preset: "client",
      presetConfig: { fragmentMasking: false },
      config: {
        documentMode: "string",
        useTypeImports: true,
        // Fail on an unmapped scalar rather than quietly emitting `any` for it.
        strictScalars: true,
        scalars: { ID: "string", AWSDateTime: "string", AWSJSON: "string" },
        enumsAsTypes: true,
        skipTypename: true,
      },
    },
  },
  hooks: {
    // The preset's own boilerplate has explicit `any`s that tsc will not flag.
    afterAllFileWrite: ["node scripts/normalise-generated.mjs"],
  },
};

export default config;
