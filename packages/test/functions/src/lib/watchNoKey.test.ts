import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getClient } from "@movie-date/functions/lib/db";
import { getWatchOptions } from "@movie-date/functions/lib/watch";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, expect, it, vi } from "vitest";
import { jsonResponse, stubFetch } from "../fetchStub";

// Its own file because the real module keeps a key it has read for the container's life.
vi.mock("@movie-date/functions/lib/secrets", () => ({
  getRapidApiKey: async () => null,
  getTmdbKey: async () => "a-key",
}));

const dynamo = mockClient(getClient());

afterEach(() => {
  vi.unstubAllGlobals();
});

it("goes straight to TMDB when there is no RapidAPI key", async () => {
  dynamo.on(GetCommand).resolves({});
  dynamo.on(PutCommand).resolves({});
  const fetchStub = stubFetch(() => jsonResponse({ results: {} }));
  expect(await getWatchOptions(949)).toEqual([]);
  const hosts = fetchStub.mock.calls.map(([input]) => new URL(input).hostname);
  expect(hosts).toEqual(["api.themoviedb.org"]);
});
