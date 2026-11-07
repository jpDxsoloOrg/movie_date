import { findProvider, PROVIDERS, type WatchOption, type WatchOptionType } from "@movie-date/core";
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
      link: asText(option.link),
      logoUrl: provider ? null : asText(asRecord(service.imageSet).lightThemeImage),
    },
  ];
}

async function fromRapidApi(movieId: number, apiKey: string): Promise<WatchOption[]> {
  const url = new URL(`https://${RAPIDAPI_HOST}/shows/movie/${movieId}`);
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
async function fromTmdb(movieId: number): Promise<WatchOption[]> {
  const region = await getTmdbWatchProviders(movieId);
  const link = asText(region.link);
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

async function loadWatchOptions(movieId: number, userId: string): Promise<WatchOption[]> {
  const apiKey = await getRapidApiKey();
  if (!apiKey || !(await mayCallRapidApi(userId))) return fromTmdb(movieId);
  try {
    return await fromRapidApi(movieId, apiKey);
  } catch {
    return fromTmdb(movieId);
  }
}

export async function getWatchOptions(movieId: number, userId: string): Promise<WatchOption[]> {
  // Here too, not just in TMDB's path helper: that runs after RapidAPI has been paid for.
  if (!Number.isInteger(movieId) || movieId < 1) throw new ValidationError("Invalid movie id.");
  // Null marks a movie neither service knows, so a repeat of a bad id costs nothing.
  const options = await cached<WatchOption[] | null>("watch", String(movieId), DAY_SECONDS, async () => {
    try {
      return await loadWatchOptions(movieId, userId);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  });
  if (options === null) throw new NotFoundError();
  return options;
}
