import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

let client: SSMClient | undefined;
let tmdbKey: Promise<string> | undefined;
let rapidApiKey: Promise<string | null> | undefined;

async function readParameter(envName: string): Promise<string> {
  const name = process.env[envName];
  if (!name) throw new Error(`${envName} is not set`);
  client ??= new SSMClient({});
  const result = await client.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  const value = result.Parameter?.Value;
  if (!value) throw new Error(`Parameter from ${envName} is empty`);
  return value;
}

export function getTmdbKey(): Promise<string> {
  tmdbKey ??= readParameter("TMDB_KEY_PARAM").catch((error: unknown) => {
    // A throttled read at cold start must not poison the container for its whole life.
    tmdbKey = undefined;
    throw error;
  });
  return tmdbKey;
}

/** Null when the key can't be read: Where to Watch then falls back to TMDB rather than failing. */
export function getRapidApiKey(): Promise<string | null> {
  rapidApiKey ??= readParameter("RAPIDAPI_KEY_PARAM").catch((error: unknown) => {
    rapidApiKey = undefined;
    console.warn("RapidAPI key unavailable", error instanceof Error ? error.name : "unknown");
    return null;
  });
  return rapidApiKey;
}
