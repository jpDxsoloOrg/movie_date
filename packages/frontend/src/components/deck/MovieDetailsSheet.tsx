import { BottomSheet } from "../BottomSheet";
import { Icon } from "../Icon";
import { Skeleton } from "../Skeleton";
import { ErrorState } from "../StateMessage";
import { useAsyncData } from "../../hooks/useAsyncData";
import { api, errorMessage, type MediaType, type Movie } from "../../services/api";
import { MODE_COPY } from "../../mode/modeCopy";
import { useMode } from "../../mode/ModeProvider";
import { PlexStatusPanel } from "../match/PlexStatusPanel";
import { WhereToWatch } from "../match/WhereToWatch";
import { networkAndRating, runtimeAndRating, showSummary, type MediaItem } from "./movieFacts";
import "./MovieDetailsSheet.css";

/** Only ever mounted by a deliberate tap, because it starts playing with sound. */
export function TrailerPlayer({ movie, trailerId }: { movie: Movie; trailerId: string }): JSX.Element {
  return (
    <iframe
      className="deck-details__video"
      src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailerId)}?autoplay=1`}
      title={`${movie.title} trailer`}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}

function Trailer({ movie, mediaType }: { movie: Movie; mediaType: MediaType }): JSX.Element {
  const { data: trailerId, error, reload } = useAsyncData(() => api.trailer(movie.id, mediaType), [movie.id, mediaType]);

  if (error && trailerId === undefined) {
    return <ErrorState title="Couldn't load the trailer" message={errorMessage(error)} onRetry={() => void reload()} />;
  }
  if (trailerId === undefined) {
    return (
      <div role="status" aria-label="Loading trailer">
        <Skeleton shape="rect" className="deck-details__video" />
      </div>
    );
  }
  if (trailerId === null) {
    return <p className="deck-details__no-trailer">No trailer available</p>;
  }
  return <TrailerPlayer movie={movie} trailerId={trailerId} />;
}

function MovieDetails({ item }: { item: MediaItem }): JSX.Element {
  const { movie, show, mediaType } = item;
  const factLines = show
    ? [showSummary(show), networkAndRating(show), movie.runtime ? `${movie.runtime} min an episode` : ""]
    : [runtimeAndRating(movie)];
  return (
    <div className="deck-details">
      <Trailer movie={movie} mediaType={mediaType} />
      <div className="deck-details__summary">
        {movie.posterUrl ? (
          <img className="deck-details__poster" src={movie.posterUrl} alt="" />
        ) : (
          <div className="deck-details__poster deck-details__poster--missing">
            <Icon name={MODE_COPY[mediaType].icon} />
          </div>
        )}
        <div className="deck-details__facts">
          <h2 className="deck-details__title">{movie.title}</h2>
          {movie.genres.length > 0 && <p>{movie.genres.join(", ")}</p>}
          {factLines.filter(Boolean).map((line) => (
            <p key={line}>{line}</p>
          ))}
          {movie.releaseYear && !show && <p className="deck-details__year">{movie.releaseYear}</p>}
        </div>
      </div>
      <WhereToWatch movieId={movie.id} movieTitle={movie.title} mediaType={mediaType} />
      <PlexStatusPanel movieId={movie.id} movieTitle={movie.title} mediaType={mediaType} />
      <p className="deck-details__overview">{movie.overview}</p>
    </div>
  );
}

/** The trailer iframe exists only while `item` is set, so closing stops playback. */
export function MovieDetailsSheet({ item, onClose }: { item: MediaItem | null; onClose: () => void }): JSX.Element {
  const { copy } = useMode();
  return (
    <BottomSheet open={item !== null} onClose={onClose} label={item ? `${item.movie.title} details` : copy.detailsFallback}>
      {item && <MovieDetails key={`${item.mediaType}:${item.movie.id}`} item={item} />}
    </BottomSheet>
  );
}
