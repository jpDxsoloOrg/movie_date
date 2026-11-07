import type { Movie } from "../../services/api";

/** "170 min | 8.3/10", leaving out whichever half TMDB doesn't have. */
export function runtimeAndRating(movie: Movie): string {
  const facts: string[] = [];
  if (movie.runtime) facts.push(`${movie.runtime} min`);
  if (movie.voteAverage) facts.push(`${movie.voteAverage.toFixed(1)}/10`);
  return facts.join(" | ");
}
