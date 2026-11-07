import type { ReactNode } from "react";
import { useMode } from "../../mode/ModeProvider";
import { Button } from "../Button";
import type { ApplyControlProps } from "./ApplyBar";
import { FilterCount } from "./FilterCount";
import { PosterFan } from "./PosterFan";
import "./PreviewTicket.css";

export interface PreviewTicketProps extends ApplyControlProps {
  /** The active filter summary. */
  children: ReactNode;
}

/** Desktop: the count, the preview and Apply, torn off like an admit-one stub. */
export function PreviewTicket({
  preview,
  noun,
  problem,
  saving,
  onApply,
  children,
}: PreviewTicketProps): JSX.Element {
  const { copy } = useMode();
  return (
    <aside className="preview-ticket" aria-label="Preview">
      <div className="preview-ticket__main">
        <p className="preview-ticket__eyebrow">{copy.previewEyebrow}</p>
        <PosterFan preview={preview} size="large" />
        <div className="preview-ticket__count">
          <FilterCount preview={preview} noun={noun} problem={problem} />
        </div>
        <div className="preview-ticket__summary">{children}</div>
      </div>
      <div className="preview-ticket__stub">
        <Button block loading={saving} disabled={Boolean(problem)} onClick={onApply}>
          Apply
        </Button>
      </div>
    </aside>
  );
}
