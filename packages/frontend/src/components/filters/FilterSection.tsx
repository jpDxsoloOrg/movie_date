import { useId, type ReactNode } from "react";
import "./FilterSection.css";

export interface FilterSectionProps {
  title: string;
  /** The section's state in a few words, opposite the title. */
  meta?: string;
  children: ReactNode;
}

export function FilterSection({ title, meta, children }: FilterSectionProps): JSX.Element {
  const headingId = useId();
  return (
    <section className="filter-section" aria-labelledby={headingId}>
      <header className="filter-section__header">
        <h3 id={headingId} className="filter-section__title">
          {title}
        </h3>
        {meta && <p className="filter-section__meta">{meta}</p>}
      </header>
      {children}
    </section>
  );
}
