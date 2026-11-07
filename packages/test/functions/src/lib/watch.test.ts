import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getClient } from "@movie-date/functions/lib/db";
import { NotFoundError, UpstreamError } from "@movie-date/functions/lib/errors";
import { getWatchOptions } from "@movie-date/functions/lib/watch";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, stubFetch } from "../fetchStub";

const dynamo = mockClient(getClient());
const ssm = mockClient(SSMClient);
const TMDB_WATCH_PAGE = "https://www.themoviedb.org/movie/949/watch?locale=US";

const service = (id: string, name: string) => ({
  id,
  name,
  imageSet: { lightThemeImage: `https://media.example/${id}.svg` },
});

const tmdbProviders = {
  results: {
    US: {
      link: TMDB_WATCH_PAGE,
      flatrate: [{ provider_id: 8, provider_name: "Netflix", logo_path: "/n.jpg" }],
      rent: [
        { provider_id: 8, provider_name: "Netflix", logo_path: "/n.jpg" },
        { provider_id: 2, provider_name: "Apple TV Store", logo_path: "/a.jpg" },
      ],
      ads: [{ provider_id: 73, provider_name: "Tubi TV", logo_path: "/t.jpg" }],
    },
    GB: { link: "https://elsewhere" },
  },
};

function isRapidApi(url: URL): boolean {
  return url.hostname === "streaming-availability.p.rapidapi.com";
}

beforeEach(() => {
  dynamo.reset();
  ssm.reset();
  dynamo.on(GetCommand).resolves({});
  dynamo.on(PutCommand).resolves({});
  dynamo.on(UpdateCommand).resolves({});
  ssm.on(GetParameterCommand).resolves({ Parameter: { Value: "a-key" } });
  vi.stubEnv("TMDB_KEY_PARAM", "/test/tmdb");
  vi.stubEnv("RAPIDAPI_KEY_PARAM", "/test/rapid");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getWatchOptions from RapidAPI", () => {
  it("asks for the US listing with the key in a header, not the URL", async () => {
    const fetchStub = stubFetch(() => jsonResponse({ streamingOptions: {} }));
    await getWatchOptions(949, "user-1");
    const [input, init] = fetchStub.mock.calls[0] ?? [];
    const url = new URL(input as URL);
    expect(url.pathname).toBe("/shows/movie/949");
    expect(url.searchParams.get("country")).toBe("us");
    expect(url.searchParams.get("output_language")).toBe("en");
    expect(url.toString()).not.toContain("a-key");
    expect(init?.headers).toMatchObject({ "x-rapidapi-key": "a-key" });
  });

  it("keeps a link only if it's a web address, because it goes straight into an href", async () => {
    stubFetch(() =>
      jsonResponse({
        streamingOptions: {
          us: [
            { service: service("netflix", "Netflix"), type: "subscription", link: "javascript:alert(1)" },
            { service: service("hulu", "Hulu"), type: "subscription", link: "http://hulu.example" },
            { service: service("prime", "Prime Video"), type: "subscription", link: "not a url" },
          ],
        },
      }),
    );
    const options = await getWatchOptions(949, "user-1");
    expect(options.map((option) => option.link)).toEqual([null, null, null]);
  });

  it("keeps the cheapest option per service, with deep links", async () => {
    stubFetch(() =>
      jsonResponse({
        streamingOptions: {
          us: [
            { service: service("prime", "Prime Video"), type: "buy", link: "https://p/buy" },
            { service: service("prime", "Prime Video"), type: "rent", link: "https://p/rent" },
            { service: service("netflix", "Netflix"), type: "subscription", link: "https://n" },
            { service: service("plutotv", "Pluto TV"), type: "free", link: "https://pluto" },
            { service: service("odd", "Odd"), type: "mystery", link: "https://odd" },
          ],
          ca: [{ service: service("crave", "Crave"), type: "subscription", link: "https://c" }],
        },
      }),
    );
    expect(await getWatchOptions(949, "user-1")).toEqual([
      {
        serviceId: "prime",
        serviceName: "Prime Video",
        type: "rent",
        link: "https://p/rent",
        logoUrl: null,
      },
      {
        serviceId: "netflix",
        serviceName: "Netflix",
        type: "subscription",
        link: "https://n",
        logoUrl: null,
      },
      {
        serviceId: "plutotv",
        serviceName: "Pluto TV",
        type: "free",
        link: "https://pluto",
        logoUrl: "https://media.example/plutotv.svg",
      },
    ]);
  });

  it("treats a listing with no US options as nowhere to watch", async () => {
    const fetchStub = stubFetch(() => jsonResponse({ streamingOptions: {} }));
    expect(await getWatchOptions(949, "user-1")).toEqual([]);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("caches for 24 hours", async () => {
    stubFetch(() => jsonResponse({ streamingOptions: {} }));
    await getWatchOptions(949, "user-1");
    const item = dynamo.commandCalls(PutCommand)[0]?.args[0].input.Item;
    expect(item?.pk).toBe("CACHE#watch#949");
    expect(item?.expiresAt - Date.now() / 1000).toBeCloseTo(86_400, -1);
  });
});

describe("getWatchOptions falling back to TMDB", () => {
  const expected = [
    {
      serviceId: "tubi",
      serviceName: "Tubi",
      type: "free",
      link: TMDB_WATCH_PAGE,
      logoUrl: "https://image.tmdb.org/t/p/w92/t.jpg",
    },
    {
      serviceId: "netflix",
      serviceName: "Netflix",
      type: "subscription",
      link: TMDB_WATCH_PAGE,
      logoUrl: "https://image.tmdb.org/t/p/w92/n.jpg",
    },
    {
      serviceId: "tmdb-2",
      serviceName: "Apple TV Store",
      type: "rent",
      link: TMDB_WATCH_PAGE,
      logoUrl: "https://image.tmdb.org/t/p/w92/a.jpg",
    },
  ];

  it("when RapidAPI fails", async () => {
    stubFetch((url) => (isRapidApi(url) ? jsonResponse({}, 429) : jsonResponse(tmdbProviders)));
    expect(await getWatchOptions(949, "user-1")).toEqual(expected);
  });

  it("when RapidAPI doesn't know the title", async () => {
    stubFetch((url) => (isRapidApi(url) ? jsonResponse({}, 404) : jsonResponse(tmdbProviders)));
    expect(await getWatchOptions(949, "user-1")).toEqual(expected);
  });

  it("is empty when TMDB has no US listing", async () => {
    stubFetch((url) => (isRapidApi(url) ? jsonResponse({}, 500) : jsonResponse({ results: {} })));
    expect(await getWatchOptions(949, "user-1")).toEqual([]);
  });

  it("fails, uncached, when both sources are down", async () => {
    stubFetch(() => jsonResponse({}, 500));
    await expect(getWatchOptions(949, "user-1")).rejects.toBeInstanceOf(UpstreamError);
    expect(dynamo.commandCalls(PutCommand)).toHaveLength(0);
  });
});

describe("getWatchOptions spending limits", () => {
  const overLimit = Object.assign(new Error("over"), { name: "ConditionalCheckFailedException" });
  const limitKeys = (): unknown[] =>
    dynamo.commandCalls(UpdateCommand).map((call) => call.args[0].input.Key);

  function tmdbOnly() {
    return stubFetch((url) =>
      isRapidApi(url) ? jsonResponse({ streamingOptions: {} }) : jsonResponse(tmdbProviders),
    );
  }

  it.each([[-1], [0], [1.5]])("refuses id %s before spending anything", async (movieId) => {
    const fetchStub = tmdbOnly();
    await expect(getWatchOptions(movieId, "user-1")).rejects.toMatchObject({ code: "VALIDATION" });
    expect(fetchStub).not.toHaveBeenCalled();
    expect(dynamo.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it("charges the caller and the shared budget for a RapidAPI lookup", async () => {
    tmdbOnly();
    await getWatchOptions(949, "user-1");
    expect(limitKeys()).toEqual([
      { pk: "USER#user-1", sk: expect.stringMatching(/^LIMIT#rapidapi#\d{4}-\d{2}-\d{2}$/) },
      { pk: "LIMIT#rapidapi", sk: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    ]);
  });

  it("charges nothing for a cached movie", async () => {
    dynamo.on(GetCommand).resolves({
      Item: { pk: "x", sk: "x", value: [], expiresAt: Math.floor(Date.now() / 1000) + 60 },
    });
    const fetchStub = tmdbOnly();
    await getWatchOptions(949, "user-1");
    expect(fetchStub).not.toHaveBeenCalled();
    expect(dynamo.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it("sends someone over their limit to TMDB, without touching the shared budget", async () => {
    dynamo.on(UpdateCommand).rejects(overLimit);
    const fetchStub = tmdbOnly();
    const options = await getWatchOptions(949, "user-1");
    expect(options.map((option) => option.serviceId)).toContain("netflix");
    expect(fetchStub.mock.calls.some(([url]) => isRapidApi(new URL(String(url))))).toBe(false);
    expect(limitKeys()).toHaveLength(1);
  });

  it("sends everyone to TMDB once the shared budget is gone", async () => {
    dynamo.on(UpdateCommand).resolvesOnce({}).rejects(overLimit);
    const fetchStub = tmdbOnly();
    await getWatchOptions(949, "user-1");
    expect(fetchStub.mock.calls.some(([url]) => isRapidApi(new URL(String(url))))).toBe(false);
  });

  it("remembers a movie neither service knows, so asking again is free", async () => {
    stubFetch(() => jsonResponse({}, 404));
    await expect(getWatchOptions(2147483647, "user-1")).rejects.toBeInstanceOf(NotFoundError);
    expect(dynamo.commandCalls(PutCommand)[0]?.args[0].input.Item).toMatchObject({ value: null });

    dynamo.on(GetCommand).resolves({
      Item: { pk: "x", sk: "x", value: null, expiresAt: Math.floor(Date.now() / 1000) + 60 },
    });
    const fetchStub = stubFetch(() => jsonResponse({}, 404));
    await expect(getWatchOptions(2147483647, "user-1")).rejects.toBeInstanceOf(NotFoundError);
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe("shows", () => {
  const options = [
    { service: service("netflix", "Netflix"), type: "subscription", link: "https://netflix.example/1" },
  ];

  it("asks RapidAPI's TV path, which answers in the same shape", async () => {
    const fetchStub = stubFetch((url) => {
      expect(url.pathname).toBe("/shows/tv/1399");
      return jsonResponse({ streamingOptions: { us: options } });
    });
    const answer = await getWatchOptions(1399, "user-1", "TV");
    expect(answer.map((option) => option.serviceId)).toEqual(["netflix"]);
    expect(fetchStub).toHaveBeenCalledOnce();
  });

  it("falls back to TMDB's TV providers", async () => {
    stubFetch((url) => {
      if (isRapidApi(url)) return jsonResponse({}, 500);
      expect(url.pathname).toBe("/3/tv/1399/watch/providers");
      return jsonResponse(tmdbProviders);
    });
    const answer = await getWatchOptions(1399, "user-1", "TV");
    expect(answer.map((option) => option.serviceId)).toContain("netflix");
  });

  it("caches apart from the movie with the same number", async () => {
    stubFetch(() => jsonResponse({ streamingOptions: { us: options } }));
    await getWatchOptions(550, "user-1", "TV");
    const cacheRows = dynamo.commandCalls(PutCommand).map((call) => call.args[0].input.Item?.pk);
    expect(cacheRows).toContain("CACHE#watch#tv:550");
  });
});
