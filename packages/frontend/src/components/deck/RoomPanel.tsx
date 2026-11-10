import { useState } from "react";
import { Link } from "react-router-dom";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useRoom, useRoomEvents } from "../../hooks/useRoom";
import { api, type Match } from "../../services/api";
import { BottomSheet } from "../BottomSheet";
import { Chip } from "../Chip";
import { Icon } from "../Icon";
import { Skeleton } from "../Skeleton";
import { formatHistoryDate } from "../match/historyFormat";
import { MatchDetails } from "../match/MatchDetails";
import { MoviePoster } from "../match/MoviePoster";
import { Avatar } from "../room/Avatar";
import { useMode } from "../../mode/ModeProvider";
import { filtersPath } from "../../mode/modeRoutes";
import { filterLabels } from "./filterSummary";
import { RoomTicket } from "./RoomTicket";
import "./RoomPanel.css";

const LATEST_MATCHES = 3;

function SectionHeading({ title, to, linkLabel }: { title: string; to: string; linkLabel: string }): JSX.Element {
  return (
    <div className="deck-room__heading">
      <h2 className="deck-room__title">{title}</h2>
      <Link className="deck-room__link" to={to}>
        {linkLabel}
      </Link>
    </div>
  );
}

function Members(): JSX.Element {
  const { room } = useRoom();
  const alone = room.members.length < 2;
  return (
    <section className="deck-room__section" aria-label="Members">
      <SectionHeading title="In the room" to="/members" linkLabel="Manage" />
      <ul className="deck-room__members" data-tour="members-list">
        {room.members.map((member) => (
          <li key={member.userId} className="deck-room__member">
            <Avatar url={member.avatarUrl} />
            <span className="deck-room__member-name">{member.displayName}</span>
            {member.isMe && <span className="deck-room__you">You</span>}
          </li>
        ))}
      </ul>
      <p className="deck-room__note">
        {alone
          ? "It takes two. Invite someone to start matching."
          : `${room.matchThreshold} likes make a match${room.requireMajority ? ", by majority" : ""}.`}
      </p>
    </section>
  );
}

function ActiveFilters(): JSX.Element {
  const { room } = useRoom();
  const { mode: mediaType } = useMode();
  const filters = mediaType === "TV" ? room.tvFilters : room.filters;
  const needsGenres = filters.genreIds.length > 0;
  // A failed lookup falls back to a count, so it isn't worth an error of its own.
  const { data: genres } = useAsyncData(
    async () => (needsGenres ? api.genres(mediaType) : []),
    [needsGenres, mediaType],
  );
  const labels = filterLabels(filters, genres);

  return (
    <section className="deck-room__section" aria-label="Active filters">
      <SectionHeading title="Filters" to={filtersPath(mediaType)} linkLabel={labels.length > 0 ? "Change" : "Add"} />
      {labels.length > 0 ? (
        <ul className="deck-room__filters">
          {labels.map((label) => (
            <li key={label}>
              <Chip label={label} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="deck-room__note">No filters. Everything's on the table.</p>
      )}
    </section>
  );
}

function LatestMatches({ dataTour }: { dataTour?: string }): JSX.Element {
  const { room } = useRoom();
  const { mode: mediaType } = useMode();
  const [selected, setSelected] = useState<Match | null>(null);
  const { data, error, reload } = useAsyncData(
    () => api.matches({ limit: LATEST_MATCHES }, mediaType),
    [room.id, mediaType],
  );
  useRoomEvents((event) => {
    if (event.type === "MATCH_FOUND" && (event.mediaType ?? mediaType) === mediaType) void reload();
  });
  const matches = data?.matches;

  return (
    <section className="deck-room__section" aria-label="Latest matches" data-tour={dataTour}>
      <SectionHeading title="Latest matches" to="/history" linkLabel="See all" />
      {!matches && !error && (
        <div className="deck-room__matches" role="status" aria-label="Loading matches">
          <Skeleton shape="rect" className="deck-room__match-skeleton" />
          <Skeleton shape="rect" className="deck-room__match-skeleton" />
        </div>
      )}
      {!matches && error ? (
        <button type="button" className="deck-room__retry" onClick={() => void reload()}>
          Couldn't load matches. Try again
        </button>
      ) : null}
      {matches?.length === 0 && <p className="deck-room__note">Your first match will land here.</p>}
      {matches && matches.length > 0 && (
        <ul className="deck-room__matches">
          {matches.map((match) => (
            <li key={match.id}>
              <button type="button" className="deck-room__match" onClick={() => setSelected(match)}>
                <MoviePoster className="deck-room__match-poster" posterUrl={match.movie.posterUrl} alt="" thumbnail mediaType={match.mediaType} />
                <span className="deck-room__match-text">
                  <span className="deck-room__match-title">{match.movie.title}</span>
                  <span className="deck-room__match-date">{formatHistoryDate(match.matchedAt)}</span>
                </span>
                <Icon name="heart" className="deck-room__match-icon" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <BottomSheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        label={selected ? `${selected.movie.title} details` : "Match details"}
      >
        {selected && <MatchDetails key={selected.id} item={selected} />}
      </BottomSheet>
    </section>
  );
}

export function RoomPanel({ onInvite }: { onInvite: () => void }): JSX.Element {
  const { room } = useRoom();
  return (
    <aside className="deck-room" aria-label="Your room">
      <RoomTicket code={room.code} admits={room.members.length} onInvite={onInvite} />
      <Members />
      <ActiveFilters />
      <LatestMatches data-tour="latest-matches" />
    </aside>
  );
}
