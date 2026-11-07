import type { Movie, Room } from "@movie-date/core";
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

/** The first person's room, with everyone else joined to it. */
export async function roomOf(...names: string[]): Promise<Room> {
  const [owner = "", ...others] = names;
  const room = await myRoom({}, user(owner));
  for (const name of others) await joinRoom({ code: room.code }, user(name));
  return myRoom({}, user(owner));
}
