import { useContext, useState } from "react";
import { DetailsPanel } from "../components/deck/DetailsPanel";
import { InviteSheet } from "../components/deck/InviteSheet";
import { MovieDetailsSheet } from "../components/deck/MovieDetailsSheet";
import { RoomPanel } from "../components/deck/RoomPanel";
import { RoomTicketStrip } from "../components/deck/RoomTicket";
import { SwipeDeck } from "../components/deck/SwipeDeck";
import { ModeSwitch } from "../components/ModeSwitch";
import { MatchBannerSlotContext } from "../context/RoomProvider";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useRoom } from "../hooks/useRoom";
import { useMode } from "../mode/ModeProvider";
import type { DeckCard } from "../services/api";
import "./Home.css";

export default function Home(): JSX.Element {
  const { room, deckVersion } = useRoom();
  const bannerSlot = useContext(MatchBannerSlotContext);
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === "mobile";
  const isDesktop = breakpoint === "desktop";
  const { mode: mediaType } = useMode();
  const [detailsCard, setDetailsCard] = useState<DeckCard | null>(null);
  const [topCard, setTopCard] = useState<DeckCard | null>();
  // The deck behind these restarts on a mode change, but Home can outlive it.
  const shownTop = topCard?.mediaType === mediaType || topCard === null ? topCard : undefined;
  const shownDetails = detailsCard?.mediaType === mediaType ? detailsCard : null;
  const [inviteOpen, setInviteOpen] = useState(false);
  const openInvite = (): void => setInviteOpen(true);

  // The stage comes first and nothing conditional sits ahead of it, so the deck stays
  // mounted through a rotation that crosses a breakpoint. It's also the first stop for Tab.
  return (
    <div className="home md-page-full">
      <div className="home__stage">
        <ModeSwitch className="home__mode" />
        {isMobile && <RoomTicketStrip code={room.code} members={room.members} onInvite={openInvite} />}
        <div ref={bannerSlot} className="home__banner-slot" />
        {/* The key makes a new round or new filters a fresh deck. The sheets sit outside
            it so a roommate's filter change doesn't shut a trailer someone is watching. */}
        <SwipeDeck
          key={deckVersion}
          onOpenDetails={isDesktop ? undefined : setDetailsCard}
          onTopChange={setTopCard}
        />
      </div>
      {!isMobile && (
        <div className="home__side">
          {isDesktop && <DetailsPanel item={shownTop} />}
          <RoomPanel onInvite={openInvite} />
        </div>
      )}
      <MovieDetailsSheet item={shownDetails} onClose={() => setDetailsCard(null)} />
      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} code={room.code} />
    </div>
  );
}
