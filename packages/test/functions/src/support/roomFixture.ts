import type { Movie, Room, Show } from "@movie-date/core";
import { joinRoom } from "@movie-date/functions/handlers/joinRoom";
import { myRoom } from "@movie-date/functions/handlers/myRoom";
import type { ResolverContext } from "@movie-date/functions/lib/identity";

export function user(name: string): ResolverContext {
  return { userId: `sub-${name}`, email: `${name}@example.com` };
}

export function movieNamed(id: number): Movie {
  return {
    id,
    title: `Movie ${id}`,
    overview: "An overview.",
    releaseYear: 2024,
    runtime: 100,
    voteAverage: 7.5,
    posterUrl: null,
    backdropUrl: null,
    genres: ["Drama"],
  };
}

export function showNamed(id: number, overrides: Partial<Show> = {}): Show {
  return {
    id,
    title: `Show ${id}`,
    overview: "An overview.",
    firstAirYear: 2019,
    lastAirYear: 2023,
    status: "Ended",
    seasonCount: 4,
    episodeCount: 40,
    networks: ["HBO"],
    episodeRuntime: 50,
    voteAverage: 8.1,
    posterUrl: `https://image.tmdb.org/t/p/w780/${id}.jpg`,
    backdropUrl: null,
    genres: ["Drama"],
    ...overrides,
  };
}

/** The first person's room, with everyone else joined to it. */
export async function roomOf(...names: string[]): Promise<Room> {
  const [owner = "", ...others] = names;
  const room = await myRoom({}, user(owner));
  for (const name of others) await joinRoom({ code: room.code }, user(name));
  return myRoom({}, user(owner));
}
