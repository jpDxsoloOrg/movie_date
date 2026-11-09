import { useState } from "react";
import { findProvider, PLEX_SERVICE } from "@movie-date/core";
import { useAsyncData } from "../../hooks/useAsyncData";
import { api, errorMessage, type MediaType, type WatchOption } from "../../services/api";
import { Skeleton } from "../Skeleton";
import { EmptyState, ErrorState } from "../StateMessage";
import { PlexMark } from "../PlexMark";
import { safeExternalLink, usesJustWatchData } from "./watchLinks";
import "./WhereToWatch.css";

const LOADING_TILES = 4;

const TYPE_LABELS: Record<string, string> = {
  subscription: "Subscription",
  free: "Free",
  rent: "Rent",
  buy: "Buy",
  addon: "Add-on",
  library: "Library",
};

/** Plex has no deep link: it's a sign the room already owns the title, not a way out. */
function PlexTile({ option }: { option: WatchOption }): JSX.Element {
  return (
  return (
    <div className="where-to-watch__tile where-to-watch__tile--plex watch-button-plex">
    <div className="where-to-watch__tile where-to-watch__tile--plex">
      <span className="where-to-watch__plate">
        <PlexMark className="where-to-watch__plex-mark" label={option.serviceName} />
      </span>
      <span className="where-to-watch__type">{TYPE_LABELS[option.type] ?? option.type}</span>
    </div>
  );
}

function ServiceTile({ option, movieTitle }: { option: WatchOption; movieTitle: string }): JSX.Element {
  const [logoFailed, setLogoFailed] = useState(false);
  const logo = logoFailed ? null : (findProvider(option.serviceId)?.icon ?? option.logoUrl);
  const link = safeExternalLink(option.link);
  const typeLabel = TYPE_LABELS[option.type] ?? option.type;

  const content = (
    <>
      {logo ? (
        <img
          className="where-to-watch__logo md-logo"
          src={logo}
          alt={option.serviceName}
          width={60}
          height={60}
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <span className="where-to-watch__name">{option.serviceName}</span>
      )}
      <span className="where-to-watch__type">{typeLabel}</span>
    </>
  );

  if (!link) return <div className="where-to-watch__tile">{content}</div>;
  return (
    <a
      className="where-to-watch__tile where-to-watch__tile--link"
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Watch ${movieTitle} on ${option.serviceName} (${typeLabel}), opens in a new tab`}
    >
      {content}
    </a>
  );
}

export interface WhereToWatchProps {
  movieId: number;
  movieTitle: string;
  mediaType?: MediaType;
  onGradient?: boolean;
}

export function WhereToWatch({
  movieId,
  movieTitle,
  mediaType = "MOVIE",
  onGradient = false,
}: WhereToWatchProps): JSX.Element {
  const {
    data: options,
    error,
    loading,
    reload,
  } = useAsyncData(() => api.watchOptions(movieId, mediaType), [movieId, mediaType]);

  function renderBody(): JSX.Element {
    if (options && options.length > 0) {
      return (
        <>
          <ul className="where-to-watch__list">
            {options.map((option) => (
              <li key={`${option.serviceId}-${option.type}`}>
                {option.serviceId === PLEX_SERVICE ? (
                  <PlexTile option={option} />
                ) : (
                  <ServiceTile option={option} movieTitle={movieTitle} />
                )}
              </li>
            ))}
          </ul>
          {usesJustWatchData(options) && (
            <p className="where-to-watch__attribution">
              Streaming data from{" "}
              <a href="https://www.justwatch.com" target="_blank" rel="noopener noreferrer">
                JustWatch
              </a>
            </p>
          )}
        </>
      );
    }
    if (options) {
      return (
        <EmptyState
          title="Not streaming right now"
          message="We couldn't find this on a streaming service in the US."
          icon="visibilityOff"
          onGradient={onGradient}
        />
      );
    }
    if (error && !loading) {
      return (
        <ErrorState
          title="Couldn't load streaming options"
          message={errorMessage(error)}
          onRetry={() => void reload()}
          onGradient={onGradient}
        />
      );
    }
    return (
      <div className="where-to-watch__list" role="status" aria-label="Loading streaming options">
        {Array.from({ length: LOADING_TILES }, (_, index) => (
          <Skeleton key={index} shape="rect" className="where-to-watch__tile-skeleton" />
        ))}
      </div>
    );
  }

  return (
    <section className={onGradient ? "where-to-watch where-to-watch--on-gradient" : "where-to-watch"}>
      <h3 className="where-to-watch__title">Where to Watch</h3>
      {renderBody()}
    </section>
  );
}
