import { useState } from "react";
import { InviteSheet } from "../components/deck/InviteSheet";
import { MovieDetailsSheet } from "../components/deck/MovieDetailsSheet";
import { SwipeDeck } from "../components/deck/SwipeDeck";
import { useRoom } from "../hooks/useRoom";
import type { Movie } from "../services/api";
import "./Home.css";

export default function Home(): JSX.Element {
  const { room, deckVersion } = useRoom();
  const [detailsMovie, setDetailsMovie] = useState<Movie | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="home">
      <button
        type="button"
        className="home__room-code"
        aria-label={`Room code ${room.code}. Invite someone`}
        onClick={() => setInviteOpen(true)}
      >
        Room Code: <strong>{room.code}</strong>
      </button>
      {/* The key makes a new round or new filters a fresh deck. The sheets sit outside
          it so a roommate's filter change doesn't shut a trailer someone is watching. */}
      <SwipeDeck key={deckVersion} onOpenDetails={setDetailsMovie} />
      <MovieDetailsSheet movie={detailsMovie} onClose={() => setDetailsMovie(null)} />
      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} code={room.code} />
    </div>
  );
}
