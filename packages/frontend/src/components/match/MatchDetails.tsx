import type { Movie } from "../../services/api";
import { Icon } from "../Icon";
import { MoviePoster } from "./MoviePoster";
import { WhereToWatch } from "./WhereToWatch";
import "./MatchDetails.css";

export interface MatchDetailsProps {
  movie: Movie;
  onGradient?: boolean;
}

/** The movie and where to watch it, shared by the match screen and past matches. */
export function MatchDetails({ movie, onGradient = false }: MatchDetailsProps): JSX.Element {
  const heading = movie.releaseYear ? `${movie.title}, ${movie.releaseYear}` : movie.title;

  return (
    <div className={onGradient ? "match-details match-details--on-gradient" : "match-details"}>
      <MoviePoster className="match-details__poster" posterUrl={movie.posterUrl} alt={`${movie.title} poster`} />
      <div className="match-details__panel">
        <h2 className="match-details__title">{heading}</h2>
        <div className="match-details__meta">
          {/* TMDB reports 0 for an unknown runtime or an unrated film. */}
          {movie.runtime ? (
            <span className="match-details__fact">
              <Icon name="clock" />
              {movie.runtime} min
            </span>
          ) : null}
          {movie.voteAverage ? (
            <span className="match-details__fact">
              <Icon name="star" />
              {movie.voteAverage.toFixed(1)}/10
            </span>
          ) : null}
        </div>
        {movie.overview && <p className="match-details__overview">{movie.overview}</p>}
        <WhereToWatch movieId={movie.id} movieTitle={movie.title} onGradient={onGradient} />
      </div>
    </div>
  );
}
