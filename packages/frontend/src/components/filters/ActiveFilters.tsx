import type { ReactNode } from "react";
import { Button } from "../Button";
import { Chip } from "../Chip";
import "./ActiveFilters.css";

export interface ActiveFilter {
  id: string;
  label: string;
  leading?: ReactNode;
  onRemove: () => void;
}

export interface ActiveFiltersProps {
  filters: ActiveFilter[];
  /** What the deck is when nothing is picked. */
  emptyText: string;
  onClearAll: () => void;
}

export function ActiveFilters({ filters, emptyText, onClearAll }: ActiveFiltersProps): JSX.Element {
  return (
    <section className="active-filters" aria-label="Active filters">
      {filters.length > 0 ? (
        <>
          <ul className="active-filters__list">
            {filters.map((filter) => (
              <li key={filter.id}>
                <Chip label={filter.label} leading={filter.leading} onRemove={filter.onRemove} />
              </li>
            ))}
          </ul>
          <Button variant="ghost" className="active-filters__clear" onClick={onClearAll}>
            Clear All
          </Button>
        </>
      ) : (
        <p className="active-filters__empty">{emptyText}</p>
      )}
    </section>
  );
}
