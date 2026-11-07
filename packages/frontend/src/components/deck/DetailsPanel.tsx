import { useEffect, useState } from "react";
import { useAsyncData } from "../../hooks/useAsyncData";
import { api, type Movie } from "../../services/api";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Skeleton } from "../Skeleton";
import { PlexStatusPanel } from "../match/PlexStatusPanel";
import { WhereToWatch } from "../match/WhereToWatch";
import { DECK_COPY } from "./deckCopy";
import { TrailerPlayer } from "./MovieDetailsSheet";
import "./DetailsPanel.css";

/**
 * Nobody opens this panel, so a card only earns its lookups once it has been on top
 * for a moment. Otherwise a fast swiper would spend three requests per card, some
 * against the paid streaming quota, on details nobody stopped to read.
 */
export const SETTLE_DELAY_MS = 450;

function useSettled(): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), SETTLE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return settled;
}

function PlayTrailer({ movie, onPlay }: { movie: Movie; onPlay: (trailerId: string) => void }): JSX.Element | null {
  const { data: trailerId } = useAsyncData(() => api.trailer(movie.id), [movie.id]);
  if (!trailerId) return null;
  return (
    <Button variant="secondary" className="deck-panel__play" onClick={() => onPlay(trailerId)}>
      <Icon name="play" /> Play Trailer
    </Button>
  );
}

function Hero({ movie, settled }: { movie: Movie; settled: boolean }): JSX.Element {
  const [trailerId, setTrailerId] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const image = movie.backdropUrl ?? movie.posterUrl;

  if (trailerId) {
    return (
      <div className="deck-panel__hero deck-panel__hero--playing">
        <TrailerPlayer movie={movie} trailerId={trailerId} />
      </div>
    );
  }
  return (
    <div className="deck-panel__hero">
      {image && !imageFailed ? (
        <img className="deck-panel__backdrop" src={image} alt="" onError={() => setImageFailed(true)} />
      ) : (
        <div className="deck-panel__backdrop deck-panel__backdrop--missing">
          <Icon name="movie" />
        </div>
      )}
      {settled && <PlayTrailer movie={movie} onPlay={setTrailerId} />}
    </div>
  );
}

function Facts({ movie }: { movie: Movie }): JSX.Element {
  return (
    <ul className="deck-panel__facts">
      {movie.voteAverage ? (
        <li className="deck-panel__fact deck-panel__fact--rating">
          <Icon name="star" />
          {movie.voteAverage.toFixed(1)}/10
        </li>
      ) : null}
      {movie.runtime ? (
        <li className="deck-panel__fact">
          <Icon name="clock" />
          {movie.runtime} min
        </li>
      ) : null}
      {movie.releaseYear ? <li className="deck-panel__fact">{movie.releaseYear}</li> : null}
    </ul>
  );
}

function WatchOptionsPlaceholder(): JSX.Element {
  return (
    <div className="deck-panel__watch-placeholder" aria-hidden="true">
      <Skeleton shape="title" />
      <div className="deck-panel__watch-tiles">
        <Skeleton shape="rect" />
        <Skeleton shape="rect" />
        <Skeleton shape="rect" />
      </div>
    </div>
  );
}

function PanelContent({ movie }: { movie: Movie }): JSX.Element {
  const settled = useSettled();
  return (
    <div className="deck-panel__scroller">
      <Hero movie={movie} settled={settled} />
      <div className="deck-panel__body">
        <h2 className="deck-panel__title">{movie.title}</h2>
        {movie.genres.length > 0 && <p className="deck-panel__genres">{movie.genres.join(", ")}</p>}
        <Facts movie={movie} />
        {/* Ahead of the longer parts: the spec wants this in view without a tap, on any screen. */}
        {settled ? <WhereToWatch movieId={movie.id} movieTitle={movie.title} /> : <WatchOptionsPlaceholder />}
        {settled && <PlexStatusPanel movieId={movie.id} movieTitle={movie.title} />}
        {movie.overview && <p className="deck-panel__overview">{movie.overview}</p>}
      </div>
    </div>
  );
}

function PanelLoading(): JSX.Element {
  return (
    <div className="deck-panel__scroller" role="status" aria-label="Loading details">
      <Skeleton shape="rect" className="deck-panel__hero" />
      <div className="deck-panel__body">
        <Skeleton shape="title" />
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    </div>
  );
}

export interface DetailsPanelProps {
  /** Undefined until the first deck has loaded; null when there's no card on top. */
  movie: Movie | null | undefined;
}

/** The key gives each card a fresh scroll position, and stops a trailer when its card leaves. */
export function DetailsPanel({ movie }: DetailsPanelProps): JSX.Element {
  return (
    <aside className="deck-panel" aria-label={movie ? `About ${movie.title}` : "About this card"}>
      {movie === undefined && <PanelLoading />}
      {movie === null && <p className="deck-panel__empty">{DECK_COPY.emptyPanel}</p>}
      {movie && <PanelContent key={movie.id} movie={movie} />}
    </aside>
  );
}
