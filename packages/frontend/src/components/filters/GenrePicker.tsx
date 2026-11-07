import { useMemo, useState } from "react";
import type { Genre } from "../../services/api";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { Skeleton } from "../Skeleton";
import { EmptyState, ErrorState } from "../StateMessage";
import { TextField } from "../TextField";
import { PickerField } from "./PickerField";
import "./GenrePicker.css";

export interface GenrePickerProps {
  genres: Genre[] | undefined;
  loading: boolean;
  errorText: string | null;
  onRetry: () => void;
  selectedIds: number[];
  onChange: (genreIds: number[]) => void;
}

/** Changes stay in the dialog until Apply, as they did in the old filter list. */
export function GenrePicker({
  genres,
  loading,
  errorText,
  onRetry,
  selectedIds,
  onChange,
}: GenrePickerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");

  const visibleGenres = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (genres ?? []).filter((genre) => genre.name.toLowerCase().includes(needle));
  }, [genres, search]);

  if (!genres) {
    if (errorText) {
      return <ErrorState title="Couldn't load genres" message={errorText} onRetry={onRetry} />;
    }
    if (loading) {
      return (
        <div className="genre-picker__loading" role="status" aria-label="Loading genres">
          <Skeleton shape="rect" className="genre-picker__skeleton" />
        </div>
      );
    }
  }

  const selectedNames = (genres ?? [])
    .filter((genre) => selectedIds.includes(genre.id))
    .map((genre) => genre.name)
    .join(", ");

  const openDialog = (): void => {
    setPendingIds(selectedIds);
    setSearch("");
    setOpen(true);
  };

  const toggle = (genreId: number): void => {
    setPendingIds((current) =>
      current.includes(genreId) ? current.filter((id) => id !== genreId) : [...current, genreId],
    );
  };

  const apply = (): void => {
    onChange(pendingIds);
    setOpen(false);
  };

  return (
    <>
      <PickerField
        label="Genres"
        value={selectedNames}
        placeholder="Any genre"
        icon="movie"
        onClick={openDialog}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Choose genres"
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={apply}>Apply</Button>
          </>
        }
      >
        <div className="genre-picker__dialog">
          {genres?.length ? (
            <>
              <TextField
                label="Search genres"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="genre-picker__summary">
                <span aria-live="polite">{pendingIds.length} selected</span>
                <Button variant="ghost" disabled={pendingIds.length === 0} onClick={() => setPendingIds([])}>
                  Reset
                </Button>
              </div>
              {visibleGenres.length > 0 ? (
                <ul className="genre-picker__chips">
                  {visibleGenres.map((genre) => {
                    const selected = pendingIds.includes(genre.id);
                    return (
                      <li key={genre.id}>
                        <button
                          type="button"
                          className={selected ? "genre-picker__chip genre-picker__chip--selected" : "genre-picker__chip"}
                          aria-pressed={selected}
                          onClick={() => toggle(genre.id)}
                        >
                          {genre.name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState title="No genres found" message="Try a different search." />
              )}
            </>
          ) : (
            <EmptyState title="No genres available" message="Check back in a little while." />
          )}
        </div>
      </Modal>
    </>
  );
}
