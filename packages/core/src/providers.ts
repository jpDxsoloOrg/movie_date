export type ServiceKey =
  | "any"
  | "tubi"
  | "prime"
  | "netflix"
  | "hulu"
  | "hbo"
  | "apple"
  | "disney"
  | "paramount"
  | "peacock"
  | "plex";

export interface StreamingProvider {
  key: ServiceKey;
  label: string;
  /** TMDB watch-provider ids. Paramount+ has several; `any` and `plex` have none. */
  tmdbProviderIds: number[];
  /** Path under the frontend's public root. */
  icon: string;
}

export const ANY_SERVICE: ServiceKey = "any";
/** Filtered from the room's library index, never by TMDB. */
export const PLEX_SERVICE: ServiceKey = "plex";

export const PROVIDERS: readonly StreamingProvider[] = [
  { key: "any", label: "Any", tmdbProviderIds: [], icon: "/movieDate.png" },
  { key: "tubi", label: "Tubi", tmdbProviderIds: [73], icon: "/icons/tubi.png" },
  { key: "prime", label: "Amazon Prime", tmdbProviderIds: [9], icon: "/icons/prime.png" },
  { key: "netflix", label: "Netflix", tmdbProviderIds: [8], icon: "/icons/netflix.png" },
  { key: "hulu", label: "Hulu", tmdbProviderIds: [15], icon: "/icons/hulu.png" },
  { key: "hbo", label: "HBO Max", tmdbProviderIds: [1899], icon: "/icons/max.png" },
  { key: "apple", label: "Apple TV", tmdbProviderIds: [350], icon: "/icons/apple.png" },
  { key: "disney", label: "Disney+", tmdbProviderIds: [337], icon: "/icons/disney.png" },
  {
    key: "paramount",
    label: "Paramount+",
    tmdbProviderIds: [531, 1770, 1853],
    icon: "/icons/paramount.png",
  },
  { key: "peacock", label: "Peacock", tmdbProviderIds: [386], icon: "/icons/peacock.png" },
  { key: "plex", label: "Plex", tmdbProviderIds: [], icon: "/icons/plex.svg" },
];

/** What a room can pick from: Plex only applies once a member has linked it. */
export function selectableProviders(plexAvailable: boolean): readonly StreamingProvider[] {
  return PROVIDERS.filter((provider) => plexAvailable || provider.key !== PLEX_SERVICE);
}

export function findProvider(key: string): StreamingProvider | undefined {
  return PROVIDERS.find((provider) => provider.key === key);
}

export function isServiceKey(key: string): key is ServiceKey {
  return findProvider(key) !== undefined;
}

/**
 * TMDB provider ids for the chosen services, empty when unrestricted. `any`
 * wins over specific services: the old app sent its placeholder id 0 alongside
 * them, which only ever narrowed the results by accident.
 */
export function providerIdsForServices(services: readonly string[]): number[] {
  if (services.includes(ANY_SERVICE)) return [];
  const ids = services.flatMap((key) => findProvider(key)?.tmdbProviderIds ?? []);
  return [...new Set(ids)];
}
