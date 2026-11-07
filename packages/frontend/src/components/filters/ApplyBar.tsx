import { Button } from "../Button";
import { FilterCount, type ItemNoun } from "./FilterCount";
import { PosterFan } from "./PosterFan";
import type { FilterPreviewState } from "./useFilterPreview";
import "./ApplyBar.css";

export interface ApplyControlProps {
  preview: FilterPreviewState;
  noun: ItemNoun;
  problem: string | null;
  saving: boolean;
  onApply: () => void;
}

/** Phone and tablet: the count and Apply, always in reach. */
export function ApplyBar({ preview, noun, problem, saving, onApply }: ApplyControlProps): JSX.Element {
  return (
    <div className="apply-bar">
      <PosterFan preview={preview} size="small" />
      <div className="apply-bar__count">
        <FilterCount preview={preview} noun={noun} problem={problem} />
      </div>
      <Button className="apply-bar__button" loading={saving} disabled={Boolean(problem)} onClick={onApply}>
        Apply
      </Button>
    </div>
  );
}
