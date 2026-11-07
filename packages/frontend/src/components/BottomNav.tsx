import { useState } from "react";
import { NavLink } from "react-router-dom";
import JoinRoomDialog from "./JoinRoomDialog";
import { Icon } from "./Icon";
import "./BottomNav.css";

export function BottomNav(): JSX.Element {
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <>
      <nav className="md-bottom-nav" aria-label="Main">
        <NavLink to="/" end className="md-bottom-nav__item">
          <Icon name="home" />
          Home
        </NavLink>
        <button type="button" className="md-bottom-nav__item" onClick={() => setJoinOpen(true)}>
          <Icon name="door" />
          Join Room
        </button>
        <NavLink to="/filters" className="md-bottom-nav__item">
          <Icon name="search" />
          Search
        </NavLink>
      </nav>
      <JoinRoomDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </>
  );
}
