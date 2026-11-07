import { RateLimitedError } from "./errors.js";
import { globalLimit, userLimit } from "./keys.js";
import { consume, hourWindow, minuteWindow, refund } from "./limits.js";

/**
 * Limits on the calls that walk TMDB page after page. A sparse deck call can make
 * about 300 TMDB calls and hold a Lambda for most of 30 seconds, and the account only
 * has 10 Lambdas to run at once, across every app in it. Sign-up costs nothing, so
 * only the shared limits hold against many accounts; the per-user ones stop any one
 * person using those up.
 */

/** A sparse call deals 10 cards, so this outruns anyone reading them. */
export const USER_DECK_WALKS_PER_MINUTE = 10;
/** The form waits for a pause before asking, so this is a preview every two seconds. */
export const USER_PREVIEWS_PER_MINUTE = 30;
/** Roughly a dozen people swiping non-stop on the hardest filters. */
export const GLOBAL_WALKS_PER_HOUR = 1_000;
/** Warm walks take under a second, so these are only ever full when something is wrong. */
export const MAX_ACTIVE_DECK_WALKS = 3;
export const MAX_ACTIVE_SHOW_PREVIEWS = 3;

const MINUTE_ROW_TTL_SECONDS = 300;
const HOUR_ROW_TTL_SECONDS = 7_200;

const BUSY_MESSAGE = "That search is busy right now. Give it a moment and try again.";
const TOO_FAST_MESSAGE = "That's a lot of searching. Give it a minute and try again.";

/**
 * Holds one of `max` places while `work` runs. A place lost to a crash is only lost
 * until the minute ends, because each minute has its own row. A walk that crosses into
 * the next minute isn't counted in it, so for a moment twice as many can run.
 */
async function withActivePlace<Result>(name: string, max: number, work: () => Promise<Result>): Promise<Result> {
  const place = globalLimit(name, minuteWindow());
  if (!(await consume(place, max, MINUTE_ROW_TTL_SECONDS))) throw new RateLimitedError(BUSY_MESSAGE);
  try {
    return await work();
  } finally {
    await refund(place);
  }
}

async function takeGlobalWalk(): Promise<void> {
  if (!(await consume(globalLimit("tmdb-walk", hourWindow()), GLOBAL_WALKS_PER_HOUR, HOUR_ROW_TTL_SECONDS))) {
    throw new RateLimitedError(BUSY_MESSAGE);
  }
}

/** The user's limit goes first, so someone already over it can't drain the shared ones. */
export async function withDeckWalkPermit<Result>(userId: string, work: () => Promise<Result>): Promise<Result> {
  const limit = userLimit(userId, "deck-walk", minuteWindow());
  if (!(await consume(limit, USER_DECK_WALKS_PER_MINUTE, MINUTE_ROW_TTL_SECONDS))) {
    throw new RateLimitedError(TOO_FAST_MESSAGE);
  }
  await takeGlobalWalk();
  return withActivePlace("tmdb-walk-active", MAX_ACTIVE_DECK_WALKS, work);
}

/** Every preview counts, in both modes: the form treats a refusal as having no count to show. */
export async function takePreviewUnit(userId: string): Promise<void> {
  const limit = userLimit(userId, "filter-preview", minuteWindow());
  if (!(await consume(limit, USER_PREVIEWS_PER_MINUTE, MINUTE_ROW_TTL_SECONDS))) {
    throw new RateLimitedError(TOO_FAST_MESSAGE);
  }
}

/** Show previews look at several pages, and an actor's costs a credits lookup each. */
export async function withShowPreviewPermit<Result>(work: () => Promise<Result>): Promise<Result> {
  await takeGlobalWalk();
  return withActivePlace("tmdb-preview-active", MAX_ACTIVE_SHOW_PREVIEWS, work);
}
