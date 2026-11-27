/**
 * Every word that differs between Movies and Going Steady, so components never name
 * what's being swiped. Read it through `useMode().copy`, or `MODE_COPY[mediaType]` for a
 * row that carries its own mode. Words that are the same in both modes stay in the
 * component.
 *
 * Paths live in modeRoutes.ts, the current mode in ModeProvider.tsx.
 */
import type { IconName } from "../components/Icon";
import type { MediaType } from "../services/api";

export interface ModeCopy {
  /** The Movies | Shows switch on Home, and History's toggle. */
  switchLabel: string;
  /** The app bar, and the page's h1 where a route has no title of its own. */
  appTitle: string;
  /** Where a title has no art, and on the brand tile. */
  icon: IconName;
  noun: { one: string; other: string };
  deckLabel: string;
  loading: string;
  likeOverlay: string;
  passOverlay: string;
  /** The buttons and keyboard hints under the deck. */
  likeAction: string;
  passAction: string;
  /** How a history row reads the swipe. */
  likedLabel: string;
  passedLabel: string;
  endTitle: string;
  endMessage: string;
  /** The walk found nothing and stopped to ask, because going on costs real calls. */
  pausedTitle: string;
  pausedMessage: string;
  emptyPanel: string;
  undoRefused: string;
  matchHeadline: string;
  matchTagline: string;
  /** The banner someone in the other mode gets. */
  matchBanner: string;
  backToStart: string;
  noMatchesMessage: string;
  noSwipesMessage: string;
  detailsFallback: string;
  dateTitle: string;
  dateProblem: string;
  /** What the share sheet says. */
  inviteText: string;
  /** Above the desktop filter preview. */
  previewEyebrow: string;
  tutorial: TutorialCopy;
}

/** Tutorial words that differ by more than the noun. */
export interface TutorialCopy {
  /** What the Search step says the deck can be narrowed by, since shows have more filters. */
  searchFields: string;
}

export const MODE_COPY: Record<MediaType, ModeCopy> = {
  MOVIE: {
    switchLabel: "Movies",
    appTitle: "Movie Date",
    icon: "movie",
    noun: { one: "movie", other: "movies" },
    deckLabel: "Movie deck",
    loading: "Loading movies",
    likeOverlay: "Watch Movie",
    passOverlay: "Don't Watch",
    likeAction: "Like",
    passAction: "Pass",
    likedLabel: "Liked",
    passedLabel: "Passed",
    endTitle: "No more movies",
    endMessage: "You've seen everything that fits your filters. Widen them to keep swiping.",
    pausedTitle: "Nothing yet",
    pausedMessage: "We've looked through a lot of movies without finding one for you. Search further, or widen your filters.",
    emptyPanel: "Details for the top card show up here while you swipe.",
    undoRefused: "That movie already matched, so it can't be undone.",
    matchHeadline: "Match Found",
    matchTagline: "Your Movie Tonight!",
    matchBanner: "Your room matched on a movie.",
    backToStart: "Back to Start",
    noMatchesMessage: "When everyone likes the same movie, it'll show up here.",
    noSwipesMessage: "Movies you like or pass on in this room will show up here.",
    detailsFallback: "Movie details",
    dateTitle: "Release Date",
    dateProblem: "Check the release dates",
    inviteText: "Pick a movie with me on Movie Date",
    previewEyebrow: "Tonight’s deck",
    tutorial: {
      searchFields: "genre, actor, streaming service and release date",
    },
  },
  TV: {
    switchLabel: "Shows",
    appTitle: "Going Steady",
    icon: "tv",
    noun: { one: "show", other: "shows" },
    deckLabel: "Show deck",
    loading: "Loading shows",
    likeOverlay: "Go Steady",
    passOverlay: "Just Friends",
    likeAction: "Go Steady",
    passAction: "Just Friends",
    likedLabel: "Go Steady",
    passedLabel: "Just Friends",
    endTitle: "No more shows",
    endMessage: "You've seen everything that fits your filters. Widen them to keep swiping.",
    pausedTitle: "Nothing yet",
    pausedMessage: "We've looked through a lot of shows without finding one for you. Search further, or widen your filters.",
    emptyPanel: "Details for the top card show up here while you swipe.",
    undoRefused: "That show already matched, so it can't be undone.",
    matchHeadline: "It's Official",
    matchTagline: "Your Next Show!",
    matchBanner: "Your room matched on a show.",
    backToStart: "Keep Looking",
    noMatchesMessage: "When everyone goes steady with the same show, it'll land here.",
    noSwipesMessage: "Shows you swipe on in this room will land here.",
    detailsFallback: "Show details",
    dateTitle: "First Air Date",
    dateProblem: "Check the first-air dates",
    inviteText: "Pick a show with me on Going Steady",
    previewEyebrow: "Your next show",
    tutorial: {
      searchFields: "genre, actor, streaming service, status, commitment level and first air date",
    },
  },
};
