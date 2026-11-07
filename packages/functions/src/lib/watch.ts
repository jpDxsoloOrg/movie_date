import {
  DEFAULT_MEDIA_TYPE,
  findProvider,
  mediaKey,
  PROVIDERS,
  type MediaType,
  type WatchOption,
  type WatchOptionType,
} from "@movie-date/core";
import { cached, DAY_SECONDS } from "./cache.js";
import { NotFoundError, ValidationError } from "./errors.js";
import { globalLimit, userLimit } from "./keys.js";
import { consume, dayWindow } from "./limits.js";
import { getRapidApiKey } from "./secrets.js";
import {
  asRecord,
  asRecords,
  asText,
  fetchJson,
  getTmdbWatchProviders,
  imageUrl,
  type JsonRecord,
} from "./tmdb.js";
import { getTmdbShowWatchProviders } from "./tmdbTv.js";

const RAPIDAPI_HOST = "streaming-availability.p.rapidapi.com";

/**
 * Every uncached movie is a billable lookup, and sign-up is open. Past either limit
 * callers still get an answer, from TMDB, which has no deep links but costs nothing.
 * A couple choosing a film reads a handful of these a night.
 */
const RAPIDAPI_USER_DAILY_LIMIT = 50;
const RAPIDAPI_GLOBAL_DAILY_LIMIT = 500;
const RAPIDAPI_LIMIT_NAME = "rapidapi";

/** Cheapest way to watch first, since each service only gets one entry. */
const TYPE_PREFERENCE: readonly WatchOptionType[] = ["free", "subscription", "addon", "rent", "buy"];

/** TMDB's offer buckets, which are named differently from ours. */
const TMDB_OFFERS: readonly (readonly [string, WatchOptionType])[] = [
  ["free", "free"],
  ["ads", "free"],
  ["flatrate", "subscription"],
  ["rent", "rent"],
  ["buy", "buy"],
];

function isWatchOptionType(value: unknown): value is WatchOptionType {
  return TYPE_PREFERENCE.includes(value as WatchOptionType);
}

function onePerService(options: readonly WatchOption[]): WatchOption[] {
  const best = new Map<string, WatchOption>();
  for (const option of options) {
    const current = best.get(option.serviceId);
    const isCheaper =
      current &&
      TYPE_PREFERENCE.indexOf(option.type) < TYPE_PREFERENCE.indexOf(current.type);
    if (!current || isCheaper) best.set(option.serviceId, option);
  }
  return [...best.values()];
}

/** A third party's link goes straight into an href, so only a web address may reach it. */
function webLink(value: unknown): string | null {
  const link = asText(value);
  return link && URL.canParse(link) && new URL(link).protocol === "https:" ? link : null;
}

function fromStreamingOption(option: JsonRecord): WatchOption[] {
  const service = asRecord(option.service);
  const serviceId = asText(service.id);
  if (!serviceId || !isWatchOptionType(option.type)) return [];
  const provider = findProvider(serviceId);
  return [
    {
      serviceId,
      serviceName: asText(service.name) ?? provider?.label ?? serviceId,
      type: option.type,
      link: webLink(option.link),
      logoUrl: provider ? null : asText(asRecord(service.imageSet).lightThemeImage),
    },
  ];
}

/** The same answer for both types: checked against `/shows/tv/1399` on the live API. */
async function fromRapidApi(
  movieId: number,
  mediaType: MediaType,
  apiKey: string,
): Promise<WatchOption[]> {
  const path = mediaType === "TV" ? "tv" : "movie";
  const url = new URL(`https://${RAPIDAPI_HOST}/shows/${path}/${movieId}`);
  url.search = new URLSearchParams({ country: "us", output_language: "en" }).toString();
  const body = await fetchJson(url, "RapidAPI streaming-availability", {
    "x-rapidapi-key": apiKey,
    "x-rapidapi-host": RAPIDAPI_HOST,
  });
  const usOptions = asRecord(asRecord(body).streamingOptions).us;
  return onePerService(asRecords(usOptions).flatMap(fromStreamingOption));
}

/** Catalogue key where there is one, so the bundled icon and label apply. */
function tmdbServiceId(providerId: number): string {
  const provider = PROVIDERS.find((entry) => entry.tmdbProviderIds.includes(providerId));
  return provider?.key ?? `tmdb-${providerId}`;
}

/**
 * TMDB has no deep links, so every option shares its watch page. That themoviedb.org
 * link is also how the frontend knows this is JustWatch data needing attribution:
 * the schema has no source field and RapidAPI links never point there.
 */
async function fromTmdb(movieId: number, mediaType: MediaType): Promise<WatchOption[]> {
  const region =
    mediaType === "TV"
      ? await getTmdbShowWatchProviders(movieId)
      : await getTmdbWatchProviders(movieId);
  const link = webLink(region.link);
  const options = TMDB_OFFERS.flatMap(([bucket, type]) =>
    asRecords(region[bucket]).flatMap((offer): WatchOption[] => {
      if (typeof offer.provider_id !== "number") return [];
      const serviceId = tmdbServiceId(offer.provider_id);
      return [
        {
          serviceId,
          serviceName: findProvider(serviceId)?.label ?? asText(offer.provider_name) ?? serviceId,
          type,
          link,
          logoUrl: imageUrl("w92", offer.logo_path),
        },
      ];
    }),
  );
  return onePerService(options);
}

/** The user's limit goes first, so someone already over it can't drain the shared one. */
async function mayCallRapidApi(userId: string): Promise<boolean> {
  const window = dayWindow();
  return (
    (await consume(userLimit(userId, RAPIDAPI_LIMIT_NAME, window), RAPIDAPI_USER_DAILY_LIMIT)) &&
    (await consume(globalLimit(RAPIDAPI_LIMIT_NAME, window), RAPIDAPI_GLOBAL_DAILY_LIMIT))
  );
}

async function loadWatchOptions(
  movieId: number,
  mediaType: MediaType,
  userId: string,
): Promise<WatchOption[]> {
  const apiKey = await getRapidApiKey();
  if (!apiKey || !(await mayCallRapidApi(userId))) return fromTmdb(movieId, mediaType);
  try {
    return await fromRapidApi(movieId, mediaType, apiKey);
  } catch {
    return fromTmdb(movieId, mediaType);
  }
}

export async function getWatchOptions(
  movieId: number,
  userId: string,
  mediaType: MediaType = DEFAULT_MEDIA_TYPE,
): Promise<WatchOption[]> {
  // Here too, not just in TMDB's path helper: that runs after RapidAPI has been paid for.
  if (!Number.isInteger(movieId) || movieId < 1) throw new ValidationError("Invalid movie id.");
  // Null marks a movie neither service knows, so a repeat of a bad id costs nothing.
  const cacheKey = mediaType === "TV" ? mediaKey("TV", movieId) : String(movieId);
  const options = await cached<WatchOption[] | null>("watch", cacheKey, DAY_SECONDS, async () => {
    try {
      return await loadWatchOptions(movieId, mediaType, userId);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  });
  if (options === null) throw new NotFoundError();
  return options;
}
