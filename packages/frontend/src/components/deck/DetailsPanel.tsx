import { useEffect, useState } from "react";
import { useAsyncData } from "../../hooks/useAsyncData";
import { api, type MediaType, type Movie, type Show } from "../../services/api";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Skeleton } from "../Skeleton";
import { PlexStatusPanel } from "../match/PlexStatusPanel";
import { WhereToWatch } from "../match/WhereToWatch";
import { MODE_COPY } from "../../mode/modeCopy";
import { useMode } from "../../mode/ModeProvider";
import { TrailerPlayer } from "./MovieDetailsSheet";
import { airingLabel, networksLabel, seasonsLabel, showYears, type MediaItem } from "./movieFacts";
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

interface PlayTrailerProps {
  movie: Movie;
  mediaType: MediaType;
  onPlay: (trailerId: string) => void;
}

function PlayTrailer({ movie, mediaType, onPlay }: PlayTrailerProps): JSX.Element | null {
  const { data: trailerId } = useAsyncData(() => api.trailer(movie.id, mediaType), [movie.id, mediaType]);
  if (!trailerId) return null;
  return (
    <Button variant="secondary" className="deck-panel__play" onClick={() => onPlay(trailerId)}>
      <Icon name="play" /> Play Trailer
    </Button>
  );
}

function Hero({ item, settled }: { item: MediaItem; settled: boolean }): JSX.Element {
  const { movie, mediaType } = item;
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
          <Icon name={MODE_COPY[mediaType].icon} />
        </div>
      )}
      {settled && <PlayTrailer movie={movie} mediaType={mediaType} onPlay={setTrailerId} />}
    </div>
  );
}

function ShowFacts({ movie, show }: { movie: Movie; show: Show }): JSX.Element {
  const facts = [showYears(show), seasonsLabel(show), airingLabel(show), networksLabel(show)].filter(Boolean);
  return (
    <ul className="deck-panel__facts">
      {show.voteAverage ? (
        <li className="deck-panel__fact deck-panel__fact--rating">
          <Icon name="star" />
          {show.voteAverage.toFixed(1)}/10
        </li>
      ) : null}
      {/* TMDB often has no episode length, so this one comes and goes. */}
      {movie.runtime ? (
        <li className="deck-panel__fact">
          <Icon name="clock" />
          {movie.runtime} min an episode
        </li>
      ) : null}
      {facts.map((fact) => (
        <li key={fact} className="deck-panel__fact">
          {fact}
        </li>
      ))}
    </ul>
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

function PanelContent({ item }: { item: MediaItem }): JSX.Element {
  const { movie, show, mediaType } = item;
  const settled = useSettled();
  return (
    <div className="deck-panel__scroller">
      <Hero item={item} settled={settled} />
      <div className="deck-panel__body">
        <h2 className="deck-panel__title">{movie.title}</h2>
        {movie.genres.length > 0 && <p className="deck-panel__genres">{movie.genres.join(", ")}</p>}
        {show ? <ShowFacts movie={movie} show={show} /> : <Facts movie={movie} />}
        {/* Ahead of the longer parts: the spec wants this in view without a tap, on any screen. */}
        {settled ? (
          <WhereToWatch movieId={movie.id} movieTitle={movie.title} mediaType={mediaType} />
        ) : (
          <WatchOptionsPlaceholder />
        )}
        {settled && <PlexStatusPanel movieId={movie.id} movieTitle={movie.title} mediaType={mediaType} />}
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
  item: MediaItem | null | undefined;
}

/** The key gives each card a fresh scroll position, and stops a trailer when its card leaves. */
export function DetailsPanel({ item }: DetailsPanelProps): JSX.Element {
  const { copy } = useMode();
  return (
    <aside className="deck-panel" aria-label={item ? `About ${item.movie.title}` : "About this card"} data-tour="details">
      {item === undefined && <PanelLoading />}
      {item === null && <p className="deck-panel__empty">{copy.emptyPanel}</p>}
      {item && <PanelContent key={`${item.mediaType}:${item.movie.id}`} item={item} />}
    </aside>
  );
}
