/**
 * Tour step shape with before/after hooks for opening components.
 */
export type TutorialStepId =
  | "deck"
  | "details"
  | "filters"
  | "match"
  | "invite"
  | "join"
  | "members"
  | "settings"
  | "history"
  | "mode"
  | "plex"
  | "install";

export type TutorialDevice = "phone" | "desktop";

export interface TutorialStep {
  id: TutorialStepId;
  /** The route to render for this step (e.g., "/"). */
  route: string;
  /** Device anchor selector for MutationObserver. */
  anchor: string;
  /** Before hook that opens the drawer/details sheet/invite sheet via context hook. */
  before?: (ctx: TutorialContext) => void | Promise<void>;
  /** After hook that closes what was opened by before. */
  after?: (ctx: TutorialContext) => void | Promise<void>;
  /** Caption for phone, desktop-specific caption, alt text. */
  caption: {
    text?: (copy: ModeCopy) => string;
    desktopText?: (copy: ModeCopy) => string;
    alt: (copy: ModeCopy, device: TutorialDevice) => string;
  };
  /** Whether this step can be skipped interactively. */
  interactive?: boolean;
}

export interface TutorialContext {
  /** Open the drawer. */
  openDrawer(): void;
  /** Close the drawer. */
  closeDrawer(): void;
  /** Open the details sheet. */
  openDetailsSheet(): void;
  /** Close the details sheet. */
  closeDetailsSheet(): void;
  /** Open the invite sheet. */
  openInviteSheet(): void;
  /** Close the invite sheet. */
  closeInviteSheet(): void;
}

export type ModeCopy = Record<string, string>;
