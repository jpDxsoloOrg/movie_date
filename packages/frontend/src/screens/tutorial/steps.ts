/**
 * The tutorial's steps, and the screenshot each one shows.
 *
 * Every string comes from ModeCopy, so Going Steady never names a movie. The images are
 * real screenshots of a demo room, taken per theme (movies, shows) and per device (phone,
 * desktop) as `tutorial-<theme>-<step>-<device>.webp` beside this file.
 */
import { MODE_COPY, type ModeCopy } from "../../mode/modeCopy";
import type { MediaType } from "../../services/api";

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

/** Tablets (640 to 1023px) get the phone shot: their layout is the phone's, centred. */
export type TutorialDevice = "phone" | "desktop";

export interface TutorialStep {
  id: TutorialStepId;
  title: (copy: ModeCopy) => string;
  text: (copy: ModeCopy) => string;
  /** Replaces `text` from the desktop breakpoint, where things sit in the sidebar or beside the deck. */
  desktopText?: (copy: ModeCopy) => string;
  alt: (copy: ModeCopy, device: TutorialDevice) => string;
  /** Shows the keyboard legend on desktop. */
  keys?: true;
}

/**
 * The mode step names the other mode, so in Going Steady it says "Movies", which the
 * show copy in MODE_COPY is never allowed to. Its words live here instead, by mode.
 */
const OTHER_MODE: Record<MediaType, { title: string; alt: string }> = {
  MOVIE: { title: "Going Steady, for shows", alt: "The Going Steady deck, a show poster in its indigo and teal colours" },
  TV: { title: "Movies, for tonight", alt: "The Movies deck, a poster in its coral and amber colours" },
};

const otherMode = (copy: ModeCopy): { title: string; alt: string } =>
  OTHER_MODE[copy === MODE_COPY.TV ? "TV" : "MOVIE"];

const where = (device: TutorialDevice, phone: string, desktop: string): string =>
  device === "desktop" ? desktop : phone;

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: "deck",
    keys: true,
    title: () => "Swipe to vote",
    text: ({ likeAction, passAction }) =>
      `Swipe right for yes and left for no, or use the ${likeAction} and ${passAction} buttons. Undo takes back your last swipe.`,
    desktopText: () => "Press → for yes and ← for no, or drag the poster. Backspace takes back your last swipe.",
    alt: ({ noun, likeAction, passAction }, device) =>
      `The ${noun.one} deck, with a poster on top and the ${passAction}, Undo and ${likeAction} buttons ${where(device, "under it", "beside the details")}`,
  },
  {
    id: "details",
    title: () => "See the details",
    text: () => "Tap the poster for the trailer, the full story and where to watch it.",
    desktopText: () => "The trailer, the full story and where to watch sit beside the deck, for whatever's on top.",
    alt: ({ noun }, device) =>
      where(
        device,
        `A ${noun.one}'s details open over the deck: trailer, story and where to watch`,
        `The deck with the top ${noun.one}'s trailer, story and where to watch beside it`,
      ),
  },
  {
    id: "filters",
    title: () => "Choose what's in the deck",
    text: ({ tutorial }) =>
      `Press Search to narrow the deck by ${tutorial.searchFields}. Everyone in the room swipes the same deck.`,
    desktopText: ({ tutorial }) =>
      `Press Search in the sidebar to narrow the deck by ${tutorial.searchFields}. Everyone in the room swipes the same deck.`,
    alt: ({ noun }) => `The Search page, with genres, streaming services and dates for the ${noun.other} in the deck`,
  },
  {
    id: "match",
    title: ({ matchHeadline }) => matchHeadline,
    text: ({ noun, backToStart }) =>
      `When enough of your room says yes to the same ${noun.one}, everyone sees it here, with where to watch. ${backToStart} starts a fresh deck.`,
    alt: ({ noun, matchHeadline }) => `The ${matchHeadline} screen, with the matched ${noun.one} and where to watch it`,
  },
  {
    id: "invite",
    title: () => "Invite your people",
    text: () => "Tap the room code above the deck to share a link or a QR code.",
    desktopText: () => "Invite, beside the deck, shares your room code as a link or a QR code.",
    alt: () => "The invite sheet, with the room code, a share link and a QR code",
  },
  {
    id: "join",
    title: () => "Join a room",
    text: () => "Got a code from someone? Press Join Room at the bottom and type it in.",
    desktopText: () => "Got a code from someone? Press Join Room in the sidebar and type it in.",
    alt: () => "The Join Room dialog, asking for a room code",
  },
  {
    id: "members",
    title: () => "Who's in the room",
    text: () =>
      "Room Members shows everyone in your room, and lets you leave it. Set your own name and photo on Profile.",
    alt: () => "Room Members, listing everyone in the room by name and photo",
  },
  {
    id: "settings",
    title: () => "Set the match rules",
    text: () => "In Settings, choose how many yeses make a match, or require a majority of the room.",
    alt: () => "Settings, with the number of yeses for a match and the majority switch",
  },
  {
    id: "history",
    title: () => "Look back",
    text: ({ noun }) =>
      `History keeps your matches and your own swipes, with search. Alone in a room, Reset your swipes puts every ${noun.one} back in your deck.`,
    alt: ({ noun }) => `History, listing the room's matched ${noun.other}`,
  },
  {
    id: "mode",
    title: (copy) => otherMode(copy).title,
    text: () =>
      "Switch between Movies and Going Steady at the top of the deck. Each has its own deck, filters and matches, in its own colours.",
    alt: (copy) => otherMode(copy).alt,
  },
  {
    id: "plex",
    title: () => "Plex, if you have it",
    text: () =>
      "Link your Plex Request account on Profile to see what's already on Plex, filter by it, and request anything missing.",
    alt: ({ noun }) => `A ${noun.one}'s details, showing whether it's on Plex and a Request on Plex button`,
  },
  {
    id: "install",
    title: () => "Keep it on your home screen",
    text: () => "Install App in the menu puts Movie Date on your home screen, so it opens like any other app.",
    desktopText: () => "Install App in the sidebar keeps Movie Date a click away, in its own window.",
    alt: (_copy, device) =>
      where(device, "The menu, with Install App near the bottom", "The sidebar, with Install App near the bottom"),
  },
];

/** Pixel size of each shot: phones at 390x844 CSS pixels and DPR 2, desktop at 1280x800 and DPR 1. */
export const TUTORIAL_IMAGE_SIZE: Readonly<Record<TutorialDevice, { width: number; height: number }>> = {
  phone: { width: 780, height: 1688 },
  desktop: { width: 1280, height: 800 },
};

const THEME: Record<MediaType, "movies" | "shows"> = { MOVIE: "movies", TV: "shows" };

/**
 * The file a step shows. The mode step has no shot of its own: it shows the other theme's
 * deck, which is the clearest picture of what switching does.
 */
export function tutorialImageName(stepId: TutorialStepId, mode: MediaType, device: TutorialDevice): string {
  if (stepId === "mode") return tutorialImageName("deck", mode === "TV" ? "MOVIE" : "TV", device);
  return `tutorial-${THEME[mode]}-${stepId}-${device}.webp`;
}

// One glob instead of 44 imports. Imported from src so Vite hashes the names into
// /assets/, where they're cached as immutable; the service worker leaves them out of the
// precache and caches each one when it's first shown (vite.config.ts).
const IMAGES = import.meta.glob<string>("./*.webp", { eager: true, query: "?url", import: "default" });

export function tutorialImage(stepId: TutorialStepId, mode: MediaType, device: TutorialDevice): string | undefined {
  return IMAGES[`./${tutorialImageName(stepId, mode, device)}`];
}
