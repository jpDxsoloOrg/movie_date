const STORAGE_KEY = "hasSeenTutorial";

// Without this, a browser that blocks storage would redirect to the tutorial forever.
let seenThisSession = false;

export function hasSeenTutorial(): boolean {
  if (seenThisSession) return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function markTutorialSeen(): void {
  seenThisSession = true;
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // The in-memory flag covers this session.
  }
}

/** Tests only: localStorage.clear() alone leaves the in-memory flag set. */
export function resetTutorialSeen(): void {
  seenThisSession = false;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to reset.
  }
}
