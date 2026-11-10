/**
 * Tour steps configuration with anchor IDs for each feature.
 * Each step has captions per mode from MODE_COPY, plus conditional handling.
 */

import { MODE_COPY } from "../../mode/modeCopy";

export interface TourStep {
  /** Unique ID for this step. Used in session storage and tour overlay. */
  id: string;
  /** Anchor CSS selector that identifies the element to highlight. */
  anchor: string;
  /** The caption text when on phone (in drawer or bottom nav). */
  phoneCaption: (copy: ModeCopy) => string;
  /** The caption text when on desktop (in sidebar). May differ from phone for keys, sidebar interaction. */
  desktopCaption?: (copy: ModeCopy) => string;
  /** Whether this step is conditional and should be skipped based on state. */
  conditional?: {
    required: boolean;
    key: string;
    defaultValue?: boolean;
  };
}

/**
 * Tour step IDs in order for phone (drawer/bottom nav) tour.
 */
export type TourStepId =
  | "deck"
  | "deck-buttons"
  | "deck-keys"
  | "details"
  | "where-to-watch"
  | "plex-panel"
  | "filters"
  | "filter-fields"
  | "room-code"
  | "nav-search"
  | "nav-join"
  | "invite-sheet"
  | "members-list"
  | "match-rules"
  | "history-tabs"
  | "history-reset"
  | "mode-switch"
  | "plex-link"
  | "nav-install";

/**
 * Caption functions for each step. These use MODE_COPY to ensure mode-appropriate wording.
 */

export function deckCaption(copy: ModeCopy): string {
  return `Tap a ${copy.noun.one} to see its details, trailer, and where to watch.`;
}

export function deckButtonsCaption(copy: ModeCopy): string {
  return `Swipe right for ${copy.likeAction} and left for ${copy.passAction}, or use the buttons.`;
}

export function deckKeysCaption(): string {
  return "Keyboard hints: ← Left to pass, Backspace to undo, → Right to like.";
}

export function detailsCaption(copy: ModeCopy): string {
  return `Tap a poster to see trailer, story and where to watch. ${copy.detailsFallback}.`;
}

export function whereToWatchCaption(): string {
  return "See which services have this movie or show, or request on Plex.";
}

export function plexPanelCaption(copy: ModeCopy): string {
  return `Request on Plex if you're linked in your room.`;
}

export function filtersCaption(copy: ModeCopy): string {
  return `Tap Search to narrow the deck by ${copy.tutorial?.searchFields || "genre, actor, streaming service"}.`;
}

export function filterFieldsCaption(): string {
  return "Filter fields available: Genre, Actors, Streaming Services.";
}

export function roomCodeCaption(copy: ModeCopy): string {
  // The actual room code is displayed directly in the component
  return `Share this room code with friends to join.`;
}

export function navSearchCaption(): string {
  return "Tap Search to set filters and narrow the deck.";
}

export function navJoinCaption(copy: ModeCopy): string {
  return `Tap Join Room at bottom or side nav, then enter a room code.`;
}

export function inviteSheetCaption(): string {
  return "Invite someone with this code or QR code to join your room.";
}

export function membersListCaption(): string {
  return "See who's in the room and how many yeses are needed for a match.";
}

export function matchRulesCaption(copy: ModeCopy): string {
  return `Set how many yeses make a match, or require majority of ${copy.noun.other}.`;
}

export function historyTabsCaption(): string {
  return "Switch between Matches and My Swipes to view different history.";
}

export function historyResetCaption(copy: ModeCopy): string {
  return `Reset your swipes to put every ${copy.noun.one} back in the deck.`;
}

export function modeSwitchCaption(copy: ModeCopy): string {
  return `Tap ${copy.switchLabel} to switch between Movies and Shows modes.`;
}

export function plexLinkCaption(): string {
  return "Link your Plex Request account on Profile to see what's in the library.";
}

export function navInstallCaption(copy: ModeCopy): string {
  return "Install App adds Movie Date to your home screen for quick access.";
}

/**
 * Tour step definitions mapping IDs to their anchor selectors and captions.
 */
export const TOUR_STEPS_PHONE: readonly TourStep[] = [
  { id: "deck", anchor: ".deck[data-tour]", phoneCaption: deckCaption },
  { id: "deck-buttons", anchor: ".deck__controls", phoneCaption: deckButtonsCaption },
  { id: "deck-keys", anchor: ".deck__hint[data-tour]", desktopCaption: deckKeysCaption },
  { id: "details", anchor: ".details-panel", conditional: { required: false, key: "open" } },
  { id: "where-to-watch", anchor: ".where-to-watch", phoneCaption: whereToWatchCaption },
  { id: "plex-panel", anchor: "[data-tour=\"plex-link\"]", phoneCaption: plexPanelCaption },
  { id: "filters", anchor: "#filter-controls", phoneCaption: filtersCaption },
  { id: "filter-fields", anchor: ".filters__fields-slot[data-tour]", phoneCaption: filterFieldsCaption },
  { id: "room-code", anchor: "[data-tour=\"room-code\"]", phoneCaption: roomCodeCaption },
  { id: "nav-search", anchor: ".bottom-nav__drawer nav a[href=\"/filters\"]", desktopCaption: navSearchCaption },
  { id: "nav-join", anchor: ".bottom-nav__drawer nav a[href=]", phoneCaption: navJoinCaption },
  { id: "invite-sheet", anchor: "[data-tour=\"invite-sheet\"]", phoneCaption: inviteSheetCaption },
  { id: "members-list", anchor: ".deck-room__member[data-tour]", phoneCaption: membersListCaption },
  { id: "match-rules", anchor: ".settings[data-tour]", phoneCaption: matchRulesCaption },
  { id: "history-tabs", anchor: ".history__tabs[data-tour]", phoneCaption: historyTabsCaption },
  { id: "latest-matches", anchor: ".deck-room__section[data-tour]", phoneCaption: (): string => "Your latest match appears here, or it will after you find one." },
  { id: "history-reset", anchor: "[data-tour=\"history-reset\"]", phoneCaption: historyResetCaption },
  { id: "mode-switch", anchor: ".md-switch-modes[data-tour]", phoneCaption: modeSwitchCaption },
  { id: "plex-link", anchor: "[data-tour=\"plex-link\"]", phoneCaption: plexLinkCaption },
  { id: "nav-install", anchor: "[data-tour=\"nav-install\"]", phoneCaption: navInstallCaption },
];


