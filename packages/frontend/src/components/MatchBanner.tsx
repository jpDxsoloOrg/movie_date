import { MODE_COPY } from "../mode/modeCopy";
import type { MediaType } from "../services/api";
import { Button, IconButton } from "./Button";
import { Icon } from "./Icon";
import "./MatchBanner.css";

export interface MatchBannerProps {
  mediaType: MediaType;
  /** Where the top of the screen holds what the person came for: a match's headline, History's tabs. */
  atFoot?: boolean;
  onView: () => void;
  onDismiss: () => void;
}

/**
 * A match in the mode someone isn't in. It never takes focus or blocks the deck, so a
 * swipe carries on underneath it. It wears the match's own theme, which says which mode
 * it's from before it's read.
 */
export function MatchBanner({ mediaType, atFoot = false, onView, onDismiss }: MatchBannerProps): JSX.Element {
  const copy = MODE_COPY[mediaType];
  return (
    <div
      className={atFoot ? "md-match-banner md-match-banner--foot" : "md-match-banner"}
      role="status"
      aria-label={`${copy.switchLabel} match`}
      data-theme={mediaType === "TV" ? "shows" : "movies"}
    >
      <p className="md-match-banner__text">
        <strong className="md-match-banner__headline">{copy.matchHeadline}</strong>
        {copy.matchBanner}
      </p>
      <Button onClick={onView}>View</Button>
      <IconButton label="Dismiss" onClick={onDismiss}>
        <Icon name="close" />
      </IconButton>
    </div>
  );
}
