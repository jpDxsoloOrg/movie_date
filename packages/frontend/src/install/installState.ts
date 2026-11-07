/**
 * Whether the app can be installed here, and how. Chrome, Edge and Samsung Internet
 * offer a one-tap prompt through `beforeinstallprompt`. iOS has no prompt: the only
 * way is Share, then Add to Home Screen, so we can only show the steps.
 */

/** Not in TypeScript's DOM types yet. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallPlatform = "ios" | "android" | "desktop";

export interface InstallSnapshot {
  /** Running from the home screen, or installed during this visit. */
  installed: boolean;
  /** The browser's own prompt is ready, so one tap installs. */
  canPrompt: boolean;
}

const VISITS_KEY = "installVisits";
const LAST_VISIT_KEY = "installLastVisitAt";
const DISMISSED_KEY = "installBannerDismissedAt";
/**
 * Set when the app runs from the home screen. Android and desktop share storage between
 * the installed app and the browser, so a later browser tab knows it's installed even
 * though the browser has no way to say so. iOS keeps them apart, so this can't help there.
 */
const INSTALLED_KEY = "installSeenStandalone";
/** Time away that makes the next load a new visit. Tabs live for days on phones. */
export const VISIT_GAP_MS = 6 * 60 * 60 * 1000;
/** How long Not now hides the banner. The drawer item stays either way. */
export const BANNER_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
/** The first visit is for trying it out, so the banner waits for the second. */
export const BANNER_MIN_VISITS = 2;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedThisVisit = false;
let snapshot: InstallSnapshot = { installed: false, canPrompt: false };
const listeners = new Set<() => void>();
let capturing = false;

export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayStandalone =
    typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  return iosStandalone || displayStandalone;
}

/** iPads report themselves as a Mac, so a touch screen is what gives them away. */
export function detectPlatform(userAgent: string, maxTouchPoints: number): InstallPlatform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/.test(userAgent)) return "android";
  return "desktop";
}

/** A stand-in navigator, as in some embedded browsers and tests, counts as desktop. */
export function currentPlatform(): InstallPlatform {
  try {
    return detectPlatform(navigator.userAgent ?? "", navigator.maxTouchPoints ?? 0);
  } catch {
    return "desktop";
  }
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, "true");
    else localStorage.removeItem(key);
  } catch {
    // Only costs the remembered state; this visit still knows.
  }
}

function publish(): void {
  const standalone = isStandalone();
  if (standalone || installedThisVisit) writeFlag(INSTALLED_KEY, true);
  const canPrompt = deferredPrompt !== null;
  // A prompt is only offered for an app that isn't installed, so it outranks the flag.
  const rememberedInstall = readFlag(INSTALLED_KEY) && !canPrompt;
  snapshot = { installed: installedThisVisit || standalone || rememberedInstall, canPrompt };
  listeners.forEach((listener) => listener());
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInstallSnapshot(): InstallSnapshot {
  return snapshot;
}

/**
 * Call before the app renders: Chrome fires `beforeinstallprompt` once, early, and a
 * listener added later by a component would miss it.
 */
export function startInstallCapture(): void {
  if (capturing) return;
  capturing = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    // Stops Chrome's own mini bar, so the app decides when to ask.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    // Offered again, so it was uninstalled since we last saw it.
    writeFlag(INSTALLED_KEY, false);
    publish();
  });
  window.addEventListener("appinstalled", () => {
    installedThisVisit = true;
    deferredPrompt = null;
    publish();
  });
  // A Chrome or Edge tab can move into the app window without reloading.
  if (typeof window.matchMedia === "function") {
    window.matchMedia("(display-mode: standalone)").addEventListener?.("change", publish);
  }
  recordVisit(Date.now());
  publish();
}

/** Shows the browser's prompt. A prompt can be used once, so it's dropped either way. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const prompt = deferredPrompt;
  if (!prompt) return "unavailable";
  deferredPrompt = null;
  try {
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") installedThisVisit = true;
    return outcome;
  } catch {
    return "dismissed";
  } finally {
    publish();
  }
}

function readNumber(key: string): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/**
 * A load counts as a new visit once VISIT_GAP_MS has passed since the last one counted,
 * so reloads and a second tab the same evening don't, and a tab kept open for days does.
 */
export function recordVisit(now: number): void {
  try {
    const last = readNumber(LAST_VISIT_KEY);
    if (last > 0 && now - last < VISIT_GAP_MS) return;
    localStorage.setItem(LAST_VISIT_KEY, String(now));
    localStorage.setItem(VISITS_KEY, String(readNumber(VISITS_KEY) + 1));
  } catch {
    // Storage blocked: the banner just never shows, and the drawer item still works.
  }
}

export function bannerDue(now: number): boolean {
  if (readNumber(VISITS_KEY) < BANNER_MIN_VISITS) return false;
  return now - readNumber(DISMISSED_KEY) >= BANNER_SNOOZE_MS;
}

export function snoozeBanner(now: number): void {
  try {
    localStorage.setItem(DISMISSED_KEY, String(now));
  } catch {
    // The component hides it for this visit regardless.
  }
}

/** Tests only. */
export function resetInstallState(): void {
  deferredPrompt = null;
  installedThisVisit = false;
  try {
    localStorage.removeItem(VISITS_KEY);
    localStorage.removeItem(DISMISSED_KEY);
    localStorage.removeItem(LAST_VISIT_KEY);
    localStorage.removeItem(INSTALLED_KEY);
  } catch {
    // Nothing to reset.
  }
  publish();
}

/** Tests only: stands in for the browser firing the event. */
export function setDeferredPromptForTest(prompt: BeforeInstallPromptEvent | null): void {
  deferredPrompt = prompt;
  publish();
}
