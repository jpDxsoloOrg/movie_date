import type { WatchOption } from "../../services/api";

function parseUrl(url: string | null | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Links come from third parties, so a `javascript:` one must never reach an href. */
export function safeExternalLink(link: string | null | undefined): string | null {
  const parsed = parseUrl(link);
  return parsed && (parsed.protocol === "https:" || parsed.protocol === "http:") ? parsed.href : null;
}

function isTmdbHost(url: string | null | undefined): boolean {
  const hostname = parseUrl(url)?.hostname;
  return hostname === "image.tmdb.org" || hostname === "themoviedb.org" || hostname === "www.themoviedb.org";
}

/**
 * The schema has no source field. Fallback options are the only ones pointing at
 * TMDB: its watch page as the link, its image host as the logo. Checking both
 * still catches a region that came back without a watch page.
 */
export function usesJustWatchData(options: readonly WatchOption[]): boolean {
  return options.some((option) => isTmdbHost(option.link) || isTmdbHost(option.logoUrl));
}
