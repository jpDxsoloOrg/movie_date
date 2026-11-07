import type { ReactNode } from "react";
import type { Movie } from "../../services/api";
import { Icon } from "../Icon";
import { Skeleton } from "../Skeleton";
import { MoviePoster } from "./MoviePoster";
import { PlexStatusPanel } from "./PlexStatusPanel";
import { WhereToWatch } from "./WhereToWatch";
import "./MatchDetails.css";

function rootClasses(onGradient: boolean, framed: boolean): string {
  return ["match-details", onGradient && "match-details--on-gradient", framed && "match-details--framed"]
    .filter(Boolean)
    .join(" ");
}

export interface MatchDetailsProps {
  movie: Movie;
  onGradient?: boolean;
  /** The small line above the title, like when it matched. */
  eyebrow?: string;
  /** Above the poster on a phone, and over the ticket once there's room for two columns. */
  header?: ReactNode;
  /** Below the ticket. */
  footer?: ReactNode;
}

/** The movie as a ticket, shared by the match screen and past matches. */
export function MatchDetails({ movie, onGradient = false, eyebrow, header, footer }: MatchDetailsProps): JSX.Element {
  const heading = movie.releaseYear ? `${movie.title}, ${movie.releaseYear}` : movie.title;

  return (
    <div className={rootClasses(onGradient, Boolean(header || footer))}>
      <div className="match-details__grid">
        {header && <div className="match-details__header">{header}</div>}
        <div className="match-details__poster-frame">
          <MoviePoster className="match-details__poster" posterUrl={movie.posterUrl} alt={`${movie.title} poster`} />
        </div>
        <div className="match-details__ticket">
          <div className="match-details__feature">
            {eyebrow && <p className="match-details__eyebrow">{eyebrow}</p>}
            {/* Labelled, as screen readers would otherwise pause between the two runs of text. */}
            <h2 className="match-details__title" aria-label={heading}>
              {movie.title}
              {movie.releaseYear ? <span className="match-details__year">, {movie.releaseYear}</span> : null}
            </h2>
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
              {movie.genres.length > 0 && <span className="match-details__genres">{movie.genres.join(" · ")}</span>}
            </div>
            {movie.overview && <p className="match-details__overview">{movie.overview}</p>}
          </div>
          <div className="match-details__stub">
            <WhereToWatch movieId={movie.id} movieTitle={movie.title} onGradient={onGradient} />
            <PlexStatusPanel movieId={movie.id} movieTitle={movie.title} onGradient={onGradient} />
          </div>
        </div>
        {footer && <div className="match-details__footer">{footer}</div>}
      </div>
    </div>
  );
}

/** Takes the shape of the framed ticket, so nothing jumps when the match arrives on a reload. */
export function MatchDetailsSkeleton({ header }: { header: ReactNode }): JSX.Element {
  return (
    <div className={rootClasses(true, true)}>
      <div className="match-details__grid">
        <div className="match-details__header">{header}</div>
        <div className="match-details__poster-frame">
          <Skeleton shape="poster" className="match-details__poster" />
        </div>
        <div className="match-details__ticket">
          <div className="match-details__feature">
            <Skeleton shape="title" />
            <Skeleton />
            <Skeleton />
            <Skeleton className="match-details__skeleton-short" />
          </div>
          <div className="match-details__stub">
            <Skeleton shape="title" />
            <Skeleton shape="rect" className="match-details__skeleton-tiles" />
          </div>
        </div>
      </div>
    </div>
  );
}
