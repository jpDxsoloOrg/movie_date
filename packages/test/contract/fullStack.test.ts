import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
/**
 * The frontend and backend suites each mock the other side, so neither can notice
 * the two disagreeing. Here the real `api` client's documents go through the real
 * schema into the real resolver, over an in-memory table and stubbed third
 * parties. graphql-js enforces what AppSync would: the document must validate,
 * and a null in a non-null field, or a wrongly shaped scalar, fails the request.
 */
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { handler } from "@movie-date/functions/resolver";
import { PUBLISH_MUTATION } from "@movie-date/functions/lib/events";
import * as documents from "@movie-date/frontend/gql/graphql";
import { ApiError, api } from "@movie-date/frontend/services/api";
import { setAppConfig } from "@movie-date/frontend/services/config";
import type { AppSyncResolverEvent } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import {
  GraphQLObjectType,
  Kind,
  GraphQLScalarType,
  buildSchema,
  defaultFieldResolver,
  graphql,
  isObjectType,
  parse,
  validate,
  type GraphQLFieldResolver,
  type GraphQLSchema,
} from "graphql";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDynamo } from "../functions/src/support/fakeDynamo";

const signedIn = vi.hoisted(() => ({ token: "ann" }));

vi.mock("@movie-date/frontend/src/services/auth.ts", () => ({
  getIdToken: async () => signedIn.token,
  signOut: () => undefined,
}));

const GRAPHQL_URL = "https://contract.appsync-api.us-east-1.amazonaws.com/graphql";
const AVATARS_BUCKET = "avatars-bucket";

/** A movie TMDB knows little about: every optional field is missing, in TMDB's own ways. */
const SPARSE_MOVIE_ID = 12;
const FULL_MOVIE_ID = 11;
/** TMDB's movie and TV ids overlap, so the show shares a movie's number on purpose. */
const SHOW_ID = FULL_MOVIE_ID;

function loadSchema(): GraphQLSchema {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const schema = buildSchema(
    `${read("../../frontend/appsync.graphql")}\n${read("../../../graphql/schema.graphql")}`,
  );

  // AppSync's scalars aren't pass-through: it rejects a value of the wrong form.
  const dateTime = schema.getType("AWSDateTime") as GraphQLScalarType;
  dateTime.serialize = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(value)) {
      throw new TypeError(`Not an AWSDateTime: ${String(value)}`);
    }
    return value;
  };
  const json = schema.getType("AWSJSON") as GraphQLScalarType;
  json.serialize = (value) => {
    if (typeof value !== "string") throw new TypeError("AWSJSON must be a JSON-encoded string");
    JSON.parse(value);
    return value;
  };
  return schema;
}

const schema = loadSchema();

function rootFieldNames(): string[] {
  const roots = [schema.getQueryType(), schema.getMutationType(), schema.getSubscriptionType()];
  return roots.flatMap((root) => (root ? Object.keys(root.getFields()) : []));
}

interface Identity {
  sub?: string;
  userArn?: string;
  claims?: { email: string };
}

const called = new Set<string>();

const dispatchToLambda: GraphQLFieldResolver<unknown, Identity> = async (source, args, identity, info) => {
  if (!isRootType(info.parentType)) return defaultFieldResolver(source, args, identity, info);
  called.add(info.fieldName);
  const event = { info: { fieldName: info.fieldName }, identity, arguments: args };
  return handler(event as unknown as AppSyncResolverEvent<unknown>);
};

function isRootType(type: GraphQLObjectType): boolean {
  return [schema.getQueryType(), schema.getMutationType(), schema.getSubscriptionType()].includes(type);
}

interface GraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
}

async function appSync(request: GraphQLRequest, identity: Identity): Promise<Response> {
  const validationErrors = validate(schema, parse(request.query));
  if (validationErrors.length > 0) {
    return Response.json({ errors: validationErrors.map(({ message }) => ({ message })) });
  }
  const result = await graphql({
    schema,
    source: request.query,
    contextValue: identity,
    variableValues: request.variables,
    fieldResolver: dispatchToLambda,
  });
  return Response.json({
    data: result.data ?? null,
    ...(result.errors
      ? {
          errors: result.errors.map((error) => ({
            message: error.message,
            errorType: error.originalError?.name,
          })),
        }
      : {}),
  });
}

function tmdb(url: URL): Response {
  const path = url.pathname.replace("/3/", "");
  if (path === "discover/movie") {
    const results = [FULL_MOVIE_ID, SPARSE_MOVIE_ID].map((id) => ({
      id,
      original_language: "en",
      poster_path: `/poster-${id}.jpg`,
    }));
    return Response.json({ results, total_pages: 1 });
  }
  if (path === `movie/${FULL_MOVIE_ID}`) {
    return Response.json({
      title: "Full Movie",
      overview: "Everything is known.",
      release_date: "2024-05-01",
      runtime: 120,
      vote_average: 7.8,
      vote_count: 100,
      poster_path: `/poster-${FULL_MOVIE_ID}.jpg`,
      backdrop_path: "/backdrop.jpg",
      genres: [{ id: 18, name: "Drama" }],
    });
  }
  if (path === `movie/${SPARSE_MOVIE_ID}`) {
    return Response.json({
      title: null,
      original_title: "Sparse Movie",
      overview: null,
      release_date: "",
      runtime: 0,
      vote_average: 0,
      vote_count: 0,
      poster_path: `/poster-${SPARSE_MOVIE_ID}.jpg`,
      backdrop_path: null,
      genres: [],
    });
  }
  if (path.endsWith("/videos")) {
    return Response.json({
      results: [{ site: "YouTube", key: "trailer-key", type: "Trailer", official: true }],
    });
  }
  if (path.endsWith("/watch/providers")) {
    return Response.json({
      results: {
        US: {
          link: "https://www.themoviedb.org/movie/11/watch",
          flatrate: [{ provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.jpg" }],
        },
      },
    });
  }
  if (path === "discover/tv") {
    return Response.json({
      results: [{ id: SHOW_ID, original_language: "en", poster_path: `/show-${SHOW_ID}.jpg` }],
      total_pages: 1,
      total_results: 1,
    });
  }
  if (path === `tv/${SHOW_ID}`) {
    return Response.json({
      name: "Full Show",
      overview: "A commitment.",
      first_air_date: "2019-04-01",
      last_air_date: "2023-05-01",
      status: "Ended",
      number_of_seasons: 4,
      number_of_episodes: 40,
      networks: [{ name: "HBO" }],
      episode_run_time: [],
      last_episode_to_air: { runtime: 55 },
      vote_average: 8.1,
      vote_count: 200,
      poster_path: `/show-${SHOW_ID}.jpg`,
      backdrop_path: null,
      genres: [{ id: 18, name: "Drama" }],
      external_ids: { tvdb_id: 9000 },
    });
  }
  if (path === "genre/movie/list") return Response.json({ genres: [{ id: 18, name: "Drama" }] });
  if (path === "search/person") {
    return Response.json({
      results: [{ id: 5, name: "Some Actor", profile_path: null, known_for_department: null }],
    });
  }
  throw new Error(`Unstubbed TMDB path: ${path}`);
}

function rapidApi(): Response {
  return Response.json({
    streamingOptions: {
      us: [
        {
          type: "subscription",
          link: "https://www.netflix.com/title/1",
          service: { id: "netflix", name: "Netflix", imageSet: { lightThemeImage: "https://logo/n.svg" } },
        },
        {
          type: "rent",
          link: "https://example.com/rent",
          service: { id: "vudu", name: "Vudu", imageSet: { lightThemeImage: "https://logo/v.svg" } },
        },
      ],
    },
  });
}

let table: FakeDynamo;
const ssm = mockClient(SSMClient);
const s3 = mockClient(S3Client);
let published: Record<string, unknown>[];
let rapidApiDown: boolean;
let uploads: { url: string; fieldNames: string[] }[];

function identityOf(token: string): Identity {
  return { sub: `sub-${token}`, claims: { email: `${token}@example.com` } };
}

function headerOf(init: RequestInit | undefined, name: string): string {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return headers[name] ?? "";
}

async function route(input: string | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  if (url.href === GRAPHQL_URL) {
    const request = JSON.parse(String(init?.body)) as GraphQLRequest;
    // The backend signs its publishes; the browser sends a bare Cognito token.
    if (headerOf(init, "authorization").startsWith("AWS4-HMAC-SHA256")) {
      const response = await appSync(request, { userArn: "arn:aws:sts::1:assumed-role/resolver" });
      const body = (await response.clone().json()) as {
        data?: { publishRoomEvent?: Record<string, unknown> };
      };
      if (body.data?.publishRoomEvent) published.push(body.data.publishRoomEvent);
      return response;
    }
    return appSync(request, identityOf(headerOf(init, "Authorization")));
  }
  if (url.hostname === "api.themoviedb.org") return tmdb(url);
  if (url.hostname === "streaming-availability.p.rapidapi.com") {
    return rapidApiDown ? new Response("down", { status: 503 }) : rapidApi();
  }
  if (url.hostname.includes(AVATARS_BUCKET)) {
    uploads.push({ url: url.href, fieldNames: [...(init?.body as FormData).keys()] });
    return new Response(null, { status: 204 });
  }
  throw new Error(`Unstubbed request: ${url.href}`);
}

function as(token: string): void {
  signedIn.token = token;
}

function allMovies(page: Awaited<ReturnType<typeof api.deck>>): number[] {
  return page.cards.map((card) => card.movie.id);
}

beforeEach(() => {
  table = new FakeDynamo();
  ssm.reset();
  ssm.on(GetParameterCommand).resolves({ Parameter: { Value: "test-key" } });
  s3.reset();
  s3.on(GetObjectCommand).resolves({
    Body: { transformToByteArray: async () => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]) },
  } as never);
  published = [];
  uploads = [];
  rapidApiDown = false;
  as("ann");
  vi.stubGlobal("fetch", vi.fn(route));
  vi.stubEnv("GRAPHQL_URL", GRAPHQL_URL);
  vi.stubEnv("AVATARS_BUCKET", AVATARS_BUCKET);
  vi.stubEnv("TMDB_KEY_PARAM", "/test/tmdb");
  vi.stubEnv("RAPIDAPI_KEY_PARAM", "/test/rapidapi");
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test-key");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret");
  setAppConfig({
    graphqlUrl: GRAPHQL_URL,
    realtimeUrl: "wss://contract.appsync-realtime-api.us-east-1.amazonaws.com/graphql",
    userPoolId: "us-east-1_contract",
    userPoolClientId: "client",
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  table.restore();
  setAppConfig(undefined);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the frontend's documents", () => {
  const operations = Object.entries(documents).filter(([name]) => name.endsWith("Document"));

  it("cover every client-facing root field", () => {
    const selected = operations.flatMap(([, document]) =>
      parse(String(document)).definitions.flatMap((definition) =>
        definition.kind === Kind.OPERATION_DEFINITION
          ? definition.selectionSet.selections.flatMap((selection) =>
              selection.kind === Kind.FIELD ? [selection.name.value] : [],
            )
          : [],
      ),
    );
    const backendOnly = ["publishRoomEvent", "revokeRoomSubscriptions"];
    const clientFields = rootFieldNames().filter((field) => !backendOnly.includes(field));
    expect([...new Set(selected)].sort()).toEqual(clientFields.sort());
  });

  it.each(operations)("%s validates against the schema", (_name, document) => {
    expect(validate(schema, parse(String(document)))).toEqual([]);
  });

  it("agree with the backend on the fields a room event carries", () => {
    const eventType = schema.getType("RoomEvent");
    if (!isObjectType(eventType)) throw new Error("RoomEvent is not an object type");
    const selection = (document: string) => /\{\s*\w+\([^)]*\)\s*\{([^}]*)\}/.exec(document)?.[1] ?? "";
    const fields = Object.keys(eventType.getFields()).sort();

    expect(validate(schema, parse(PUBLISH_MUTATION))).toEqual([]);
    expect(selection(PUBLISH_MUTATION).trim().split(/\s+/).sort()).toEqual(fields);
    expect(selection(String(documents.OnRoomEventDocument)).trim().split(/\s+/).sort()).toEqual(fields);
  });
});

describe("the client against the real backend", () => {
  it("takes two people from first login to a match and back to a new round", async () => {
    const ann = await api.me();
    expect(ann).toMatchObject({ id: "sub-ann", email: "ann@example.com", displayName: "ann", avatarUrl: null });

    const annRoom = await api.myRoom();
    expect(annRoom).toMatchObject({
      matchThreshold: 2,
      requireMajority: false,
      round: 1,
      filters: { genreIds: [], cast: [], services: [], releaseDateGte: null, releaseDateLte: null },
    });
    expect(annRoom.members).toEqual([
      { userId: "sub-ann", displayName: "ann", avatarUrl: null, isMe: true },
    ]);

    as("bob");
    await api.me();
    const shared = await api.joinRoom(annRoom.code.toLowerCase());
    expect(shared.id).toBe(annRoom.id);
    expect(shared.members.map((member) => [member.displayName, member.isMe])).toEqual([
      ["ann", false],
      ["bob", true],
    ]);
    expect(published).toContainEqual(
      expect.objectContaining({ roomId: annRoom.id, type: "MEMBERS_CHANGED", actorId: "sub-bob" }),
    );

    as("ann");
    const deck = await api.deck(1);
    expect(deck.nextPage).toBeNull();
    expect(allMovies(deck)).toEqual([FULL_MOVIE_ID, SPARSE_MOVIE_ID]);
    expect(deck.cards[1]?.movie).toEqual({
      id: SPARSE_MOVIE_ID,
      title: "Sparse Movie",
      overview: "",
      releaseYear: null,
      runtime: null,
      voteAverage: null,
      posterUrl: `https://image.tmdb.org/t/p/w780/poster-${SPARSE_MOVIE_ID}.jpg`,
      backdropUrl: null,
      genres: [],
    });

    const annLike = await api.swipe(SPARSE_MOVIE_ID, "LIKE");
    expect(annLike).toEqual({ movieId: SPARSE_MOVIE_ID, mediaType: "MOVIE", direction: "LIKE", match: null });

    as("bob");
    const bobDeck = await api.deck(1);
    // Ann's like changes nothing about Bob's deck.
    expect(allMovies(bobDeck)).toEqual([FULL_MOVIE_ID, SPARSE_MOVIE_ID]);

    const bobLike = await api.swipe(SPARSE_MOVIE_ID, "LIKE");
    const match = bobLike.match;
    expect(match).toMatchObject({ roomId: annRoom.id, round: 1, movie: { title: "Sparse Movie" } });
    expect(published).toContainEqual({
      roomId: annRoom.id,
      type: "MATCH_FOUND",
      movieId: SPARSE_MOVIE_ID,
      mediaType: "MOVIE",
      matchId: match?.id,
      round: 1,
      actorId: null,
    });

    as("ann");
    expect(await api.pendingMatch()).toEqual(match);
    expect(await api.findMatch(match?.id ?? "")).toEqual(match);
    expect((await api.matches()).matches).toEqual([match]);
    expect(await api.clearMatch("not-a-match")).toBe(false);
    expect(await api.clearHistory("SWIPES", "TV")).toBe(true);
    // Bob is in the room too, so a reset would throw away his round.
    await expect(api.resetSwipes("TV")).rejects.toThrow("only one in the room");
    expect(await api.undoSwipe(SPARSE_MOVIE_ID)).toEqual({
      movieId: SPARSE_MOVIE_ID,
      mediaType: "MOVIE",
      undone: false,
    });

    const nextRound = await api.startNewRound(1);
    expect(nextRound.round).toBe(2);
    expect(await api.pendingMatch()).toBeNull();
    expect(published).toContainEqual(
      expect.objectContaining({ roomId: annRoom.id, type: "ROUND_RESET", mediaType: "MOVIE", round: 2 }),
    );

    as("bob");
    expect((await api.startNewRound(1)).round).toBe(2);
    expect(allMovies(await api.deck(1))).toContain(SPARSE_MOVIE_ID);
    expect((await api.matches()).matches).toEqual([match]);

    const history = await api.swipeHistory();
    expect(history.entries).toEqual([
      expect.objectContaining({ direction: "LIKE", round: 1, movie: expect.objectContaining({ id: SPARSE_MOVIE_ID }) }),
    ]);
  });

  it("defaults every mode-aware field to movies", async () => {
    const room = await api.myRoom();
    expect(room).toMatchObject({ tvRound: 1, tvFilters: { genreIds: [], cast: [], services: [] } });
    expect((await api.deck(1)).cards[0]).toMatchObject({ mediaType: "MOVIE", show: null });
  });

  it("matches a show without touching the movie with the same id", async () => {
    await api.me();
    const room = await api.myRoom();
    as("bob");
    await api.me();
    await api.joinRoom(room.code);

    as("ann");
    const deck = await api.deck(1, "TV");
    expect(deck.nextPage).toBeNull();
    expect(deck.cards).toHaveLength(1);
    expect(deck.cards[0]).toMatchObject({
      mediaType: "TV",
      movie: { id: SHOW_ID, title: "Full Show", releaseYear: 2019, runtime: 55 },
      show: { firstAirYear: 2019, lastAirYear: 2023, status: "Ended", seasonCount: 4, networks: ["HBO"] },
    });

    expect(await api.swipe(SHOW_ID, "LIKE", "TV")).toEqual({
      movieId: SHOW_ID,
      mediaType: "TV",
      direction: "LIKE",
      match: null,
    });
    expect(allMovies(await api.deck(1))).toContain(FULL_MOVIE_ID);
    expect((await api.deck(1, "TV")).cards).toEqual([]);

    as("bob");
    expect((await api.deck(1, "TV")).cards[0]).toMatchObject({ movie: { id: SHOW_ID } });

    const match = (await api.swipe(SHOW_ID, "LIKE", "TV")).match;
    expect(match).toMatchObject({ mediaType: "TV", round: 1, show: { title: "Full Show" } });
    expect(published).toContainEqual({
      roomId: room.id,
      type: "MATCH_FOUND",
      movieId: SHOW_ID,
      mediaType: "TV",
      matchId: match?.id,
      round: 1,
      actorId: null,
    });

    as("ann");
    expect(await api.pendingMatch("TV")).toEqual(match);
    expect(await api.pendingMatch()).toBeNull();
    expect((await api.matches({}, "TV")).matches).toEqual([match]);
    expect((await api.matches()).matches).toEqual([]);

    const nextRound = await api.startNewRound(1, "TV");
    expect(nextRound).toMatchObject({ round: 1, tvRound: 2 });
    expect(published).toContainEqual(
      expect.objectContaining({ roomId: room.id, type: "ROUND_RESET", mediaType: "TV", round: 2 }),
    );
  });

  it("round-trips filters the client read back into the mutation that saves them", async () => {
    await api.me();
    const actor = (await api.searchPeople("some"))[0];
    expect(actor).toEqual({ id: 5, name: "Some Actor", profileUrl: null, knownForDepartment: null });
    if (!actor) throw new Error("No actor");

    const saved = await api.updateFilters({
      genreIds: [18],
      cast: [actor],
      services: ["netflix"],
      releaseDateGte: "2024-01-01",
      releaseDateLte: null,
    });
    expect(saved.filters).toEqual({
      genreIds: [18],
      cast: [actor],
      services: ["netflix"],
      releaseDateGte: "2024-01-01",
      releaseDateLte: null,
      showStatus: null,
      commitment: null,
      firstAirDateGte: null,
      firstAirDateLte: null,
    });

    // The Filters screen edits the fragment it was given, so it must be valid input as-is.
    const resaved = await api.updateFilters(saved.filters);
    expect(resaved.filters).toEqual(saved.filters);
    expect(published.filter((event) => event.type === "ROOM_UPDATED")).toHaveLength(2);
  });

  it("serves the movie details and streaming screens", async () => {
    await api.me();
    expect(await api.movie(FULL_MOVIE_ID)).toMatchObject({
      title: "Full Movie",
      releaseYear: 2024,
      runtime: 120,
      voteAverage: 7.8,
      backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
      genres: ["Drama"],
    });
    expect(await api.trailer(FULL_MOVIE_ID)).toBe("trailer-key");
    expect(await api.genres()).toEqual([{ id: 18, name: "Drama" }]);
    expect(await api.watchOptions(FULL_MOVIE_ID)).toEqual([
      {
        serviceId: "netflix",
        serviceName: "Netflix",
        type: "subscription",
        link: "https://www.netflix.com/title/1",
        logoUrl: null,
      },
      {
        serviceId: "vudu",
        serviceName: "Vudu",
        type: "rent",
        link: "https://example.com/rent",
        logoUrl: "https://logo/v.svg",
      },
    ]);
  });

  it("falls back to TMDB for streaming options the way the frontend detects", async () => {
    rapidApiDown = true;
    await api.me();
    expect(await api.watchOptions(SPARSE_MOVIE_ID)).toEqual([
      {
        serviceId: "netflix",
        serviceName: "Netflix",
        type: "subscription",
        link: "https://www.themoviedb.org/movie/11/watch",
        logoUrl: "https://image.tmdb.org/t/p/w92/netflix.jpg",
      },
    ]);
  });

  it("uploads an avatar with the AWSJSON fields and shows it to the room", async () => {
    const { id } = await api.me();
    const key = await api.uploadAvatar(new Blob(["jpeg"], { type: "image/jpeg" }), "image/jpeg");

    expect(key).toMatch(new RegExp(`^pending/${id}/[0-9a-f-]{36}$`));
    const [upload] = uploads;
    expect(upload?.fieldNames).toEqual(expect.arrayContaining(["Content-Type", "Policy", "key"]));
    expect(upload?.fieldNames.at(-1)).toBe("file");

    const profile = await api.updateProfile({ displayName: "Ann", avatarKey: key });
    const avatarUrl = `https://${AVATARS_BUCKET}.s3.amazonaws.com/${key.replace("pending/", "avatars/")}`;
    expect(profile).toMatchObject({ displayName: "Ann", avatarUrl });
    expect((await api.myRoom()).members[0]).toMatchObject({ displayName: "Ann", avatarUrl });
  });

  it("applies room settings and moves someone to a room of their own", async () => {
    const { id: roomId, code } = await (async () => {
      await api.me();
      return api.myRoom();
    })();
    as("bob");
    await api.me();
    await api.joinRoom(code);
    as("cat");
    await api.me();
    await api.joinRoom(code);

    const majority = await api.updateRoomSettings(2, true);
    expect(majority).toMatchObject({ matchThreshold: 2, requireMajority: true });

    const fresh = await api.leaveRoom();
    expect(fresh.id).not.toBe(roomId);
    expect(fresh.members).toHaveLength(1);
    expect(published).toContainEqual(expect.objectContaining({ roomId, type: "MEMBERS_CHANGED" }));
  });

  it("serves the Plex and filter preview fields through the real client", async () => {
    await api.me();
    expect(await api.plexStatus(FULL_MOVIE_ID)).toBeNull();
    const preview = await api.filterPreview({ genreIds: [], cast: [], services: [] });
    expect(preview).toHaveProperty("totalResults");
    expect(preview.posterUrls).toEqual(expect.any(Array));
    // Linking is out of reach here (no Plex Request in this harness); each only has to route.
    await Promise.allSettled([
      api.startPlexLink(),
      api.confirmPlexLink("123456"),
      api.unlinkPlex(),
      api.requestOnPlex(FULL_MOVIE_ID),
    ]);
  });

  it("surfaces the backend's message and code to the client", async () => {
    await api.me();
    const failure = await api.joinRoom("ZZZZZZ").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ code: "VALIDATION", message: "Invalid room code" });
  });

  it("lets members subscribe to their room and nobody else", async () => {
    await api.me();
    const { id: roomId } = await api.myRoom();
    const subscribe = (asUser: string, id: string) =>
      appSync(
        { query: String(documents.OnRoomEventDocument), variables: { roomId: id } },
        identityOf(asUser),
      ).then((response) => response.json() as Promise<{ data: unknown; errors?: unknown[] }>);

    expect(await subscribe("ann", roomId)).toEqual({ data: { onRoomEvent: null } });
    expect((await subscribe("mallory", roomId)).errors).toEqual([
      expect.objectContaining({ errorType: "FORBIDDEN" }),
    ]);
  });

  it("refuses a publish from a signed-in user", async () => {
    await api.me();
    const response = await appSync(
      {
        query: PUBLISH_MUTATION,
        variables: { input: { roomId: "room", type: "ROUND_RESET" } },
      },
      identityOf("ann"),
    );
    expect(await response.json()).toMatchObject({ errors: [{ errorType: "FORBIDDEN" }] });
  });
});

describe("coverage of the schema", () => {
  it("has exercised every root field by this point", () => {
    expect([...called].sort()).toEqual(rootFieldNames().sort());
  });
});
