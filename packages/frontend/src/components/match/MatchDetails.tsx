import type { ReactNode } from "react";
import type { Movie, Show } from "../../services/api";
import { airingLabel, networksLabel, seasonsLabel, showYears, type MediaItem } from "../deck/movieFacts";
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
  item: MediaItem;
  onGradient?: boolean;
  /** The small line above the title, like when it matched. */
  eyebrow?: string;
  /** Above the poster on a phone, and over the ticket once there's room for two columns. */
  header?: ReactNode;
  /** Below the ticket. */
  footer?: ReactNode;
}

function MovieMeta({ movie }: { movie: Movie }): JSX.Element {
  return (
    <>
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
    </>
  );
}

function ShowMeta({ show }: { show: Show }): JSX.Element {
  const facts = [seasonsLabel(show), airingLabel(show), networksLabel(show)].filter(Boolean);
  return (
    <>
      {facts.map((fact) => (
        <span key={fact} className="match-details__fact">
          {fact}
        </span>
      ))}
      {show.voteAverage ? (
        <span className="match-details__fact">
          <Icon name="star" />
          {show.voteAverage.toFixed(1)}/10
        </span>
      ) : null}
    </>
  );
}

/** The title as a ticket, shared by the match screen and past matches. */
export function MatchDetails({ item, onGradient = false, eyebrow, header, footer }: MatchDetailsProps): JSX.Element {
  const { movie, show, mediaType } = item;
  const years = show ? showYears(show) : movie.releaseYear;
  const heading = years ? `${movie.title}, ${years}` : movie.title;

  return (
    <div className={rootClasses(onGradient, Boolean(header || footer))}>
      <div className="match-details__grid">
        {header && <div className="match-details__header">{header}</div>}
        <div className="match-details__poster-frame">
          <MoviePoster className="match-details__poster" posterUrl={movie.posterUrl} alt={`${movie.title} poster`} mediaType={mediaType} />
        </div>
        <div className="match-details__ticket">
          <div className="match-details__feature">
            {eyebrow && <p className="match-details__eyebrow">{eyebrow}</p>}
            {/* Labelled, as screen readers would otherwise pause between the two runs of text. */}
            <h2 className="match-details__title" aria-label={heading}>
              {movie.title}
              {years ? <span className="match-details__year">, {years}</span> : null}
            </h2>
            <div className="match-details__meta">
              {show ? <ShowMeta show={show} /> : <MovieMeta movie={movie} />}
              {movie.genres.length > 0 && <span className="match-details__genres">{movie.genres.join(" · ")}</span>}
            </div>
            {movie.overview && <p className="match-details__overview">{movie.overview}</p>}
          </div>
          <div className="match-details__stub">
            <WhereToWatch movieId={movie.id} movieTitle={movie.title} mediaType={mediaType} onGradient={onGradient} />
            <PlexStatusPanel movieId={movie.id} movieTitle={movie.title} mediaType={mediaType} onGradient={onGradient} />
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
