import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, IconButton } from "../components/Button";
import { Chip } from "../components/Chip";
import { ActorFace } from "../components/filters/ActorFace";
import { ActorRow } from "../components/filters/ActorRow";
import { peekFilterDraft, stashFilterDraft } from "../components/filters/filterDraft";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { SkeletonList } from "../components/Skeleton";
import { EmptyState, ErrorState } from "../components/StateMessage";
import { TextField } from "../components/TextField";
import { useAsyncData } from "../hooks/useAsyncData";
import { useRoom } from "../hooks/useRoom";
import { useMode } from "../mode/ModeProvider";
import { actorsPath, filtersPath } from "../mode/modeRoutes";
import { api, errorMessage, type Person } from "../services/api";
import "./ActorSearch.css";

/** Marks the sacrificial history entry described in the guard effect below. */
interface ActorRouteState {
  unsavedGuard?: boolean;
}

export default function ActorSearch(): JSX.Element {
  const { room } = useRoom();
  const { mode: mediaType } = useMode();
  const navigate = useNavigate();
  const location = useLocation();
  const guarded = (location.state as ActorRouteState | null)?.unsavedGuard === true;

  // Pinned so that a room change while this is open can't file the draft under it.
  const [roomId] = useState(room.id);
  const [baseDraft] = useState(
    () => peekFilterDraft(room.id, mediaType) ?? (mediaType === "TV" ? room.tvFilters : room.filters),
  );
  const [selected, setSelected] = useState<Person[]>(baseDraft.cast);
  const [modified, setModified] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const results = useAsyncData(async () => (query ? api.searchPeople(query) : []), [query]);

  const openedDirectly = useRef(location.key === "default");
  const guardPushed = useRef(false);

  // BrowserRouter has no useBlocker, so browser and hardware back are caught with
  // a spare history entry: back lands on the real one, still on this screen, and
  // that's the cue to prompt.
  useEffect(() => {
    if (!modified) return;
    if (guarded) {
      guardPushed.current = true;
      setPromptOpen(false);
      return;
    }
    if (guardPushed.current) {
      setPromptOpen(true);
      return;
    }
    guardPushed.current = true;
    const state: ActorRouteState = { unsavedGuard: true };
    navigate(actorsPath(mediaType), { state });
  }, [modified, guarded, navigate, mediaType]);

  const exit = (): void => {
    if (openedDirectly.current) {
      navigate(filtersPath(mediaType), { replace: true });
      return;
    }
    navigate(guarded ? -2 : -1);
  };

  const saveAndExit = (): void => {
    if (modified) stashFilterDraft(roomId, { ...baseDraft, cast: selected }, mediaType);
    exit();
  };

  const requestExit = (): void => {
    if (modified) setPromptOpen(true);
    else exit();
  };

  const stay = (): void => {
    setPromptOpen(false);
    if (!guarded) {
      const state: ActorRouteState = { unsavedGuard: true };
      navigate(actorsPath(mediaType), { state });
    }
  };

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = searchText.trim();
    // An unchanged query wouldn't rerun by itself, and asking again should retry.
    if (trimmed === query && results.error) void results.reload();
    setQuery(trimmed);
  };

  const addActor = (actor: Person): void => {
    if (selected.some((item) => item.id === actor.id)) return;
    setSelected([...selected, actor]);
    setModified(true);
  };

  const removeActor = (actor: Person): void => {
    setSelected(selected.filter((item) => item.id !== actor.id));
    setModified(true);
  };

  // The old app hid people without a photo: TMDB's long tail is mostly namesakes.
  const visibleResults = (results.data ?? []).filter((actor) => actor.profileUrl);

  const renderResults = (): JSX.Element => {
    if (!query) return <p className="actor-search__hint">Search by name to find actors.</p>;
    if (results.error) {
      return (
        <ErrorState
          title="Couldn't search actors"
          message={errorMessage(results.error)}
          onRetry={() => void results.reload()}
        />
      );
    }
    if (results.loading) return <SkeletonList rows={3} />;
    if (visibleResults.length === 0) {
      return <EmptyState title="No actors found" message="Check the spelling or try another name." />;
    }
    return (
      <ul className="actor-search__list actor-search__list--results" aria-label="Search results">
        {visibleResults.map((actor) => {
          const added = selected.some((item) => item.id === actor.id);
          return (
            <ActorRow
              key={actor.id}
              actor={actor}
              action={
                <Button
                  variant="secondary"
                  disabled={added}
                  aria-label={`${added ? "Added" : "Add"} ${actor.name}`}
                  onClick={() => addActor(actor)}
                >
                  {added ? <Icon name="check" /> : "Add"}
                </Button>
              }
            />
          );
        })}
      </ul>
    );
  };

  return (
    <div className="actor-search">
      <header className="actor-search__header">
        <IconButton label="Back to filters" onClick={requestExit}>
          <Icon name="back" />
        </IconButton>
        <h1 className="actor-search__title">Select Actors</h1>
        <Button onClick={saveAndExit}>Save</Button>
      </header>

      <form className="actor-search__form" role="search" onSubmit={onSubmit}>
        <TextField
          label="Search Actor"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          onBlur={() => setQuery(searchText.trim())}
        />
        <IconButton className="actor-search__submit" label="Search actors" type="submit">
          <Icon name="search" />
        </IconButton>
      </form>

      <section className="actor-search__section" aria-label="Results" aria-busy={results.loading}>
        {renderResults()}
      </section>

      <section className="actor-search__section">
        <h3 className="actor-search__heading">Selected Actors</h3>
        {selected.length > 0 ? (
          <ul className="actor-search__chips" aria-label="Selected actors">
            {selected.map((actor) => (
              <li key={actor.id}>
                <Chip
                  label={actor.name}
                  leading={<ActorFace actor={actor} />}
                  onRemove={() => removeActor(actor)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="actor-search__hint">No actors selected.</p>
        )}
      </section>

      <Modal
        open={promptOpen}
        onClose={stay}
        title="Unsaved Changes"
        actions={
          <div className="actor-search__prompt-actions">
            <Button variant="secondary" onClick={exit}>
              Exit Without Saving
            </Button>
            <Button onClick={saveAndExit}>Save and Exit</Button>
          </div>
        }
      >
        <p>You have unsaved changes. Do you want to save them before exiting?</p>
      </Modal>
    </div>
  );
}
