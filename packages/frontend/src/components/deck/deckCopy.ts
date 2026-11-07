/**
 * The deck's words in one place. Going Steady swaps these with the theme
 * (docs/GOING_STEADY_TV_PLAN.md), so the components don't name what's being swiped.
 */
export const DECK_COPY = {
  deckLabel: "Movie deck",
  loading: "Loading movies",
  likeOverlay: "Watch Movie",
  passOverlay: "Don't Watch",
  endTitle: "No more movies",
  endMessage: "You've seen everything that fits your filters. Widen them to keep swiping.",
  emptyPanel: "Details for the top card show up here while you swipe.",
  undoRefused: "That movie already matched, so it can't be undone.",
} as const;
