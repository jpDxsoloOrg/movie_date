export const MIN_MATCH_THRESHOLD = 2;
export const DEFAULT_MATCH_THRESHOLD = 2;

export interface ThresholdSettings {
  matchThreshold: number;
  requireMajority: boolean;
}

/** Top of the slider. A lone member still sees 2, since a match needs two people. */
export function maxThreshold(memberCount: number): number {
  return Math.max(MIN_MATCH_THRESHOLD, memberCount);
}

export function majorityThreshold(memberCount: number): number {
  return Math.max(MIN_MATCH_THRESHOLD, Math.ceil(memberCount / 2));
}

export function clampThreshold(threshold: number, memberCount: number): number {
  return Math.min(Math.max(threshold, MIN_MATCH_THRESHOLD), maxThreshold(memberCount));
}

/**
 * The threshold actually in force. It is derived from the current member count
 * rather than stored, so majority tracks joins and leaves, and a stored value
 * can't become unreachable once members leave.
 */
export function effectiveThreshold(settings: ThresholdSettings, memberCount: number): number {
  return settings.requireMajority
    ? majorityThreshold(memberCount)
    : clampThreshold(settings.matchThreshold, memberCount);
}
