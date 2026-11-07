import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ssm = mockClient(SSMClient);

async function freshSecrets() {
  vi.resetModules();
  return import("@movie-date/functions/lib/secrets");
}

beforeEach(() => {
  ssm.reset();
  vi.stubEnv("TMDB_KEY_PARAM", "/test/tmdb");
  vi.stubEnv("RAPIDAPI_KEY_PARAM", "/test/rapid");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getTmdbKey", () => {
  it("reads the named parameter decrypted, once per container", async () => {
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: "tmdb-secret" } });
    const { getTmdbKey } = await freshSecrets();
    expect(await getTmdbKey()).toBe("tmdb-secret");
    expect(await getTmdbKey()).toBe("tmdb-secret");
    const calls = ssm.commandCalls(GetParameterCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0].input).toEqual({ Name: "/test/tmdb", WithDecryption: true });
  });

  it("tries again after a failed read", async () => {
    ssm
      .on(GetParameterCommand)
      .rejectsOnce(new Error("throttled"))
      .resolves({ Parameter: { Value: "tmdb-secret" } });
    const { getTmdbKey } = await freshSecrets();
    await expect(getTmdbKey()).rejects.toThrow("throttled");
    expect(await getTmdbKey()).toBe("tmdb-secret");
  });

  it("fails when the parameter name isn't configured", async () => {
    vi.stubEnv("TMDB_KEY_PARAM", "");
    const { getTmdbKey } = await freshSecrets();
    await expect(getTmdbKey()).rejects.toThrow("TMDB_KEY_PARAM is not set");
  });
});

describe("getRapidApiKey", () => {
  it("returns the key", async () => {
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: "rapid-secret" } });
    const { getRapidApiKey } = await freshSecrets();
    expect(await getRapidApiKey()).toBe("rapid-secret");
  });

  it("resolves null instead of failing, and retries next time", async () => {
    ssm
      .on(GetParameterCommand)
      .rejectsOnce(new Error("ParameterNotFound"))
      .resolves({ Parameter: { Value: "rapid-secret" } });
    const { getRapidApiKey } = await freshSecrets();
    expect(await getRapidApiKey()).toBeNull();
    expect(await getRapidApiKey()).toBe("rapid-secret");
  });
});
