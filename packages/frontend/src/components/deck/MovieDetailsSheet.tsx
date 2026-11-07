import { BottomSheet } from "../BottomSheet";
import { Icon } from "../Icon";
import { Skeleton } from "../Skeleton";
import { ErrorState } from "../StateMessage";
import { useAsyncData } from "../../hooks/useAsyncData";
import { api, errorMessage, type Movie } from "../../services/api";
import { runtimeAndRating } from "./movieFacts";
import "./MovieDetailsSheet.css";

function Trailer({ movie }: { movie: Movie }): JSX.Element {
  const { data: trailerId, error, reload } = useAsyncData(() => api.trailer(movie.id), [movie.id]);

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
  return (
    <iframe
      className="deck-details__video"
      src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailerId)}`}
      title={`${movie.title} trailer`}
      allow="encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}

function MovieDetails({ movie }: { movie: Movie }): JSX.Element {
  const facts = runtimeAndRating(movie);
  return (
    <div className="deck-details">
      <Trailer movie={movie} />
      <div className="deck-details__summary">
        {movie.posterUrl ? (
          <img className="deck-details__poster" src={movie.posterUrl} alt="" />
        ) : (
          <div className="deck-details__poster deck-details__poster--missing">
            <Icon name="movie" />
          </div>
        )}
        <div className="deck-details__facts">
          <h2 className="deck-details__title">{movie.title}</h2>
          {movie.genres.length > 0 && <p>{movie.genres.join(", ")}</p>}
          {facts && <p>{facts}</p>}
          {movie.releaseYear && <p className="deck-details__year">{movie.releaseYear}</p>}
        </div>
      </div>
      <p className="deck-details__overview">{movie.overview}</p>
    </div>
  );
}

/** The trailer iframe exists only while `movie` is set, so closing stops playback. */
export function MovieDetailsSheet({ movie, onClose }: { movie: Movie | null; onClose: () => void }): JSX.Element {
  return (
    <BottomSheet open={movie !== null} onClose={onClose} label={movie ? `${movie.title} details` : "Movie details"}>
      {movie && <MovieDetails key={movie.id} movie={movie} />}
    </BottomSheet>
  );
}
