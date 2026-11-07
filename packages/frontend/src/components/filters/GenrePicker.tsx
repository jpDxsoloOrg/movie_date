import type { Genre } from "../../services/api";
import { Chip } from "../Chip";
import { SkeletonChoices } from "../Skeleton";
import { EmptyState, ErrorState } from "../StateMessage";
import { FilterSection } from "./FilterSection";
import "./GenrePicker.css";

export interface GenrePickerProps {
  genres: Genre[] | undefined;
  loading: boolean;
  errorText: string | null;
  onRetry: () => void;
  selectedIds: number[];
  onChange: (genreIds: number[]) => void;
}

export function GenrePicker({
  genres,
  loading,
  errorText,
  onRetry,
  selectedIds,
  onChange,
}: GenrePickerProps): JSX.Element {
  const toggle = (genreId: number): void => {
    onChange(
      selectedIds.includes(genreId) ? selectedIds.filter((id) => id !== genreId) : [...selectedIds, genreId],
    );
  };

  const renderChoices = (): JSX.Element => {
    if (!genres && errorText) {
      return <ErrorState title="Couldn't load genres" message={errorText} onRetry={onRetry} />;
    }
    if (!genres && loading) return <SkeletonChoices count={12} />;
    if (!genres?.length) {
      return <EmptyState title="No genres available" message="Check back in a little while." />;
    }
    return (
      <div className="genre-picker" role="group" aria-label="Genres">
        {genres.map((genre) => (
          <Chip
            key={genre.id}
            label={genre.name}
            selected={selectedIds.includes(genre.id)}
            onClick={() => toggle(genre.id)}
          />
        ))}
      </div>
    );
  };

  return (
    <FilterSection title="Genres" meta={selectedIds.length > 0 ? `${selectedIds.length} selected` : "Any genre"}>
      {renderChoices()}
    </FilterSection>
  );
}
