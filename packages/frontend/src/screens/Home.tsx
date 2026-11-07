import { useState } from "react";
import { DetailsPanel } from "../components/deck/DetailsPanel";
import { InviteSheet } from "../components/deck/InviteSheet";
import { MovieDetailsSheet } from "../components/deck/MovieDetailsSheet";
import { RoomPanel } from "../components/deck/RoomPanel";
import { RoomTicketStrip } from "../components/deck/RoomTicket";
import { SwipeDeck } from "../components/deck/SwipeDeck";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useRoom } from "../hooks/useRoom";
import type { Movie } from "../services/api";
import "./Home.css";

export default function Home(): JSX.Element {
  const { room, deckVersion } = useRoom();
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === "mobile";
  const isDesktop = breakpoint === "desktop";
  const [detailsMovie, setDetailsMovie] = useState<Movie | null>(null);
  const [topMovie, setTopMovie] = useState<Movie | null>();
  const [inviteOpen, setInviteOpen] = useState(false);
  const openInvite = (): void => setInviteOpen(true);

  // The stage comes first and nothing conditional sits ahead of it, so the deck stays
  // mounted through a rotation that crosses a breakpoint. It's also the first stop for Tab.
  return (
    <div className="home md-page-full">
      <div className="home__stage">
        {isMobile && <RoomTicketStrip code={room.code} members={room.members} onInvite={openInvite} />}
        {/* The key makes a new round or new filters a fresh deck. The sheets sit outside
            it so a roommate's filter change doesn't shut a trailer someone is watching. */}
        <SwipeDeck
          key={deckVersion}
          onOpenDetails={isDesktop ? undefined : setDetailsMovie}
          onTopChange={setTopMovie}
        />
      </div>
      {!isMobile && (
        <div className="home__side">
          {isDesktop && <DetailsPanel movie={topMovie} />}
          <RoomPanel onInvite={openInvite} />
        </div>
      )}
      <MovieDetailsSheet movie={detailsMovie} onClose={() => setDetailsMovie(null)} />
      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} code={room.code} />
    </div>
  );
}
