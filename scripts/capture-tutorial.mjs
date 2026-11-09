#!/usr/bin/env node
/**
 * Retakes the tutorial screenshots from the LIVE Movie Date site.
 *
 * Seeds a throwaway room of three (Alex, who is the viewer, plus Sam and Jordan), makes
 * two matches in each mode, then photographs each tutorial step in both themes on a
 * phone and on a desktop. Everything it creates is deleted at the end by the same
 * cleanup the end-to-end run uses, including when the run fails or is interrupted.
 *
 *   AWS_PROFILE=league-szn PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
 *     node scripts/capture-tutorial.mjs
 *
 * Playwright is not a dependency of this repo. Point PLAYWRIGHT_MODULE at an install
 * whose Chromium is present, as for scripts/e2e-live.mjs.
 *
 * Output: packages/frontend/src/screens/tutorial/tutorial-<theme>-<step>-<device>.webp,
 * theme movies|shows, device phone|desktop. Phone is 390x844 at DPR 2 (780x1688 pixels),
 * desktop 1280x800 at DPR 1. The tutorial's "mode" step reuses the other theme's deck
 * image, so it has no files of its own.
 *
 * Options:
 *   --out <dir>        Keeps the PNG originals and state.json.
 *                      Default: <os tmpdir>/movie-date-tutorial/<runId>
 *   --only <regex>     Step ids to capture, e.g. "^(deck|plex)$". Seeding always runs in
 *                      full, because later steps show its matches and members.
 *   E2E_BASE_URL       Default: the production CloudFront URL
 *   E2E_HEADED=1       Show the browsers
 *
 * Recovery, if a run was killed before it could clean up:
 *   node scripts/e2e-live.mjs --cleanup <out>/state.json
 *
 * Exit code: 0 every image written, 1 something failed, 2 cleanup left data behind.
 *
 * Privacy: the screenshots show the viewer's own deck, matches and settings, never what a
 * roommate liked. Plex is faked in the browser for the "plex" step: nothing is linked,
 * and RequestOnPlex and the link mutations are answered locally and never sent.
 * Secrets: passwords are generated per run and never written or logged.
 */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BASE_URL = (process.env.E2E_BASE_URL ?? "https://moviedate.jpdxsolo.com").replace(/\/$/, "");
const GRAPHQL_URL = "https://nti4vfrsszdl3okpzctqiffsoy.appsync-api.us-east-1.amazonaws.com/graphql";
const AVATAR_BUCKET = "movie-date-production-avatarsbucket-bbbbcwzc";
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE_DIR = join(REPO, "packages/frontend/src/screens/tutorial");
const TIMEOUT_MS = 30_000;
const WEBP_QUALITY = 0.8;

/** Every captured step, in tutorial order. "mode" borrows the other theme's deck. */
const STEPS = ["deck", "details", "filters", "match", "invite", "join", "members", "settings", "history", "plex", "install"];
const THEMES = [
  { theme: "movies", mode: "MOVIE", home: "/", like: "Like", pass: "Pass" },
  { theme: "shows", mode: "TV", home: "/shows", like: "Go Steady", pass: "Just Friends" },
];

const DEVICES = {
  phone: {
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    // An iPhone, so /install shows the iPhone card the tutorial talks about.
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  },
  desktop: {
    viewport: { width: 1280, height: 800 },
    screen: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  },
  // Seeding only: the same phone e2e-live drives, so the flows behave as they do there.
  seed: {
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  },
};

const PEOPLE = [
  { name: "Alex", colour: "#e8673c" },
  { name: "Sam", colour: "#1f9e8f" },
  { name: "Jordan", colour: "#5b55d6" },
];

const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

/** Errors can quote a request; tokens must never reach the terminal. */
function redact(value) {
  return String(value)
    .replace(/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]*/g, "<jwt>")
    .replace(/(wss?:\/\/[^\s'"?]+)\?[^\s'"]*/g, "$1?<redacted>")
    .replace(/(X-Amz-[A-Za-z-]+=)[^&\s'"]+/g, "$1<redacted>");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

// ---------------------------------------------------------------- run state

const runId = randomBytes(4).toString("hex");
const OUT = resolve(argument("--out") ?? join(tmpdir(), "movie-date-tutorial", runId));
const ONLY = argument("--only") ? new RegExp(argument("--only")) : null;
const wanted = (step) => !ONLY || ONLY.test(step);

// The same shape as e2e-live's, so its --cleanup can delete what this run made.
const state = { runId, emails: [], subs: [], rooms: [], codes: [], plexEmails: [], plexSubs: [], plexRequestIds: [] };
const saveState = () => writeFileSync(join(OUT, "state.json"), JSON.stringify(state, null, 2));
const remember = (list, value) => {
  if (value && !list.includes(value)) {
    list.push(value);
    saveState();
  }
};

function opOf(request) {
  try {
    const { query } = JSON.parse(request.postData() ?? "{}");
    return /(?:query|mutation)\s+(\w+)/.exec(query ?? "")?.[1] ?? "unknown";
  } catch {
    return "unknown";
  }
}

function variablesOf(request) {
  try {
    return JSON.parse(request.postData() ?? "{}").variables ?? {};
  } catch {
    return {};
  }
}

function collectRooms(value) {
  if (Array.isArray(value)) value.forEach(collectRooms);
  else if (value && typeof value === "object") {
    if (typeof value.id === "string" && typeof value.code === "string") {
      remember(state.rooms, value.id);
      remember(state.codes, value.code);
    }
    Object.values(value).forEach(collectRooms);
  }
}

// ---------------------------------------------------------------- browser plumbing

/** Records what cleanup needs, and counts the page's own requests so a shot waits for quiet. */
function wire(page) {
  page.setDefaultTimeout(TIMEOUT_MS);
  page.inflight = new Set();
  page.on("request", (request) => {
    // The trailer iframe streams for as long as it plays; only the app's own traffic counts.
    if (request.frame() === page.mainFrame()) page.inflight.add(request);
  });
  const settle = (request) => page.inflight.delete(request);
  page.on("requestfinished", settle);
  page.on("requestfailed", settle);
  page.on("response", async (response) => {
    const request = response.request();
    if (response.url() !== GRAPHQL_URL || request.method() !== "POST") return;
    try {
      const body = await response.json();
      collectRooms(body.data);
      if (body.data?.me?.id) remember(state.subs, body.data.me.id);
    } catch {
      // The page navigated before the body was read.
    }
  });
  return page;
}

function waitOp(page, op) {
  return page.waitForResponse(
    (response) => response.url() === GRAPHQL_URL && response.request().method() === "POST" && opOf(response.request()) === op,
    { timeout: TIMEOUT_MS },
  );
}

async function newContext(browser, device, storageState) {
  return browser.newContext({
    ...DEVICES[device],
    storageState,
    locale: "en-US",
    timezoneId: "America/New_York",
    // Keeps every GraphQL call in the page, where the Plex fake can see it.
    serviceWorkers: "block",
  });
}

/**
 * A fresh page per shot, so nothing from the last one (a sheet, a toast, a stale deck)
 * carries over. The init script runs before the app on each load of this page only.
 */
async function shotPage(context, mode) {
  const page = wire(await context.newPage());
  await page.addInitScript((value) => {
    localStorage.setItem("hasSeenTutorial", "true");
    localStorage.setItem("movieDateMode", value);
  }, mode);
  return page;
}

// ---------------------------------------------------------------- seeding

class Person {
  constructor(name, colour, context) {
    this.name = name;
    this.colour = colour;
    this.context = context;
    // Memory only, never written: the account is deleted at the end anyway.
    this.password = randomBytes(12).toString("base64url");
    this.email = `e2e-live-${runId}-${name.toLowerCase()}@example.com`;
    remember(state.emails, this.email);
  }

  async open() {
    this.page = wire(await this.context.newPage());
  }
}

const onPath = (page, path) => page.waitForURL((url) => url.pathname === path);
const topCard = (page) => page.locator(".deck-card--depth-0");

async function topTitle(page) {
  return (await topCard(page).locator(".deck-card__title").textContent({ timeout: TIMEOUT_MS }))?.trim() ?? "";
}

async function register(person) {
  const { page } = person;
  await page.goto(`${BASE_URL}/register`);
  await page.getByLabel("CONFIRM PASSWORD", { exact: true }).waitFor();
  await page.getByLabel("EMAIL", { exact: true }).fill(person.email);
  await page.getByLabel("PASSWORD", { exact: true }).fill(person.password);
  await page.getByLabel("CONFIRM PASSWORD", { exact: true }).fill(person.password);
  await page.getByRole("button", { name: "Register" }).click();
  await onPath(page, "/tutorial");
  await page.getByRole("button", { name: "Skip" }).click();
  await onPath(page, "/");
  await topCard(page).waitFor();
}

/** A name and a photo, so Members and the room panel look like a real room. */
async function setProfile(person) {
  const { page } = person;
  await page.goto(`${BASE_URL}/profile`);
  const png = await page.evaluate(
    ({ initial, colour }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext("2d");
      context.fillStyle = colour;
      context.fillRect(0, 0, 512, 512);
      context.fillStyle = "#ffffff";
      context.font = "bold 280px Georgia, serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(initial, 256, 276);
      return canvas.toDataURL("image/png").split(",")[1];
    },
    { initial: person.name[0], colour: person.colour },
  );
  await page.getByLabel("Choose a profile photo").setInputFiles({
    name: `${person.name.toLowerCase()}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page.locator('.room-avatar-picker img[src^="blob:"]').waitFor();
  const upload = page.waitForResponse(
    (response) => response.url().includes(AVATAR_BUCKET) && response.request().method() === "POST",
    { timeout: TIMEOUT_MS },
  );
  const saved = waitOp(page, "UpdateProfile");
  await page.getByLabel("Display Name").fill(person.name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const uploaded = await upload;
  assert(uploaded.ok(), `${person.name}: avatar upload returned ${uploaded.status()}`);
  const body = await (await saved).json();
  assert(!body.errors, `${person.name}: UpdateProfile failed`);
  await page.getByText("Profile saved!").waitFor();
}

async function joinRoom(person, code) {
  const { page } = person;
  await page.goto(`${BASE_URL}/`);
  await topCard(page).waitFor();
  await page.getByRole("button", { name: "Join Room", exact: true }).click();
  await page.getByLabel("Enter Room Code").fill(code);
  await page.getByRole("button", { name: "Submit" }).click();
  await page.locator(".deck-ticket-strip__code", { hasText: code }).waitFor();
}

async function pressSwipe(page, label) {
  const response = waitOp(page, "Swipe");
  await page.getByRole("button", { name: label, exact: true }).click();
  const body = await (await response).json();
  assert(!body.errors, `${label} returned ${redact(JSON.stringify(body.errors))}`);
  return body.data.swipe;
}

/** Both decks are the room's deck, but one can lag a round change by a moment. */
async function sameTopCard(alex, sam, home) {
  const deadline = Date.now() + 45_000;
  let reloaded = false;
  for (;;) {
    const [mine, theirs] = await Promise.all([topTitle(alex.page), topTitle(sam.page)]);
    if (mine && mine === theirs) return mine;
    if (Date.now() > deadline) throw new Error(`decks disagree: Alex has "${mine}", Sam has "${theirs}"`);
    if (!reloaded && Date.now() > deadline - 30_000) {
      reloaded = true;
      await sam.page.goto(`${BASE_URL}${home}`);
      await topCard(sam.page).waitFor();
    }
    await sleep(500);
  }
}

/**
 * Sam likes first, which alone is no match; Alex's like makes it, so Alex lands on it.
 * A new round can deal the last match again, and History showing one title twice looks
 * like a bug, so both pass a title the room has already matched.
 */
async function makeMatch(alex, sam, { home, like, pass, mode }, matched) {
  let title = await sameTopCard(alex, sam, home);
  for (let skipped = 0; matched.includes(title); skipped += 1) {
    assert(skipped < 5, `the deck keeps dealing "${title}"`);
    await pressSwipe(sam.page, pass);
    await pressSwipe(alex.page, pass);
    await sleep(600);
    title = await sameTopCard(alex, sam, home);
  }
  const first = await pressSwipe(sam.page, like);
  assert(!first.match, `Sam's like on "${title}" matched on its own`);
  const second = await pressSwipe(alex.page, like);
  assert(second.match, `Alex and Sam both liked "${title}" but no match came back`);
  const prefix = mode === "TV" ? "/shows/match/" : "/match/";
  await alex.page.waitForURL((url) => url.pathname.startsWith(prefix));
  return { title, path: new URL(alex.page.url()).pathname };
}

/** Starts the next round in this room, which is the only room the run touches. */
async function nextRound(alex, sam, { home, mode }) {
  await alex.page.getByRole("button", { name: mode === "TV" ? "Keep Looking" : "Back to Start" }).click();
  await onPath(alex.page, home);
  await topCard(alex.page).waitFor();
  await sam.page.goto(`${BASE_URL}${home}`);
  await topCard(sam.page).waitFor();
}

/**
 * The details steps want a trailer and real streaming tiles, so Alex passes cards until
 * the top one has both. The passes also give My Swipes both directions.
 */
async function passToGoodCard(alex, { pass }) {
  const { page } = alex;
  for (let passes = 0; passes < 12; passes += 1) {
    if (passes >= 2) {
      await page.locator('.deck-card--depth-0 button[aria-label^="Details for"]').click();
      const sheet = page.getByRole("dialog", { name: / details$/ });
      const watch = sheet.locator(".where-to-watch");
      await watch.waitFor();
      await page.waitForFunction((element) => !element.querySelector('[role="status"]'), await watch.elementHandle(), {
        timeout: TIMEOUT_MS,
      });
      await sheet.locator('.deck-details__video, .deck-details__no-trailer, [role="status"][aria-label="Loading trailer"]').first().waitFor();
      await page.waitForFunction(() => !document.querySelector('[aria-label="Loading trailer"]'), null, { timeout: TIMEOUT_MS });
      const hasTrailer = (await sheet.locator("iframe.deck-details__video").count()) > 0;
      const tiles = await watch.locator(".where-to-watch__tile").count();
      await page.keyboard.press("Escape");
      await sheet.waitFor({ state: "hidden" });
      if (hasTrailer && tiles >= 2) return passes;
    }
    await pressSwipe(page, pass);
    await sleep(600);
  }
  throw new Error("no card with a trailer and streaming tiles in 12 passes");
}

// ---------------------------------------------------------------- shots

/** Waits until the page has stopped fetching and nothing it should show is still loading. */
async function settle(page, label) {
  const deadline = Date.now() + 25_000;
  let quietSince = 0;
  for (;;) {
    if (page.inflight.size === 0) {
      quietSince ||= Date.now();
      if (Date.now() - quietSince >= 800) break;
    } else quietSince = 0;
    if (Date.now() > deadline) {
      const urls = [...page.inflight].map((request) => request.url().split("?")[0]);
      throw new Error(`${label}: network never went quiet: ${urls.join(", ")}`);
    }
    await sleep(100);
  }
  await page
    .waitForFunction(
      () => {
        const visible = (element) => element.getClientRects().length > 0;
        const loading = document.querySelectorAll(
          '.md-skeleton, [role="status"][aria-label^="Loading"], [aria-label="Checking Plex"]',
        );
        if ([...loading].some(visible)) return false;
        const inView = (image) => {
          const box = image.getBoundingClientRect();
          return visible(image) && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
        };
        return [...document.images].filter(inView).every((image) => image.complete && image.naturalWidth > 0);
      },
      null,
      { timeout: 25_000 },
    )
    .catch(() => {
      throw new Error(`${label}: a skeleton or an image was still loading`);
    });
}

async function dismissToasts(page) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const toast = page.locator(".md-toast").first();
    if ((await toast.count()) === 0) return;
    await toast.click().catch(() => {});
    await sleep(250);
  }
  assert((await page.locator(".md-toast").count()) === 0, "a toast would not go away");
}

async function assertClean(page, label, theme) {
  const found = await page.evaluate(() => {
    const values = [...document.querySelectorAll("input, textarea")].map((field) => field.value);
    return {
      text: `${document.body.innerText}\n${values.join("\n")}`,
      theme: document.documentElement.dataset.theme,
      install: [...document.querySelectorAll(".md-install-banner")].some((element) => element.getClientRects().length),
      banner: [...document.querySelectorAll(".md-match-banner")].some((element) => element.getClientRects().length),
    };
  });
  assert(!found.text.includes("@example.com"), `${label}: a test email is on screen`);
  assert(!/e2e-live/.test(found.text), `${label}: a test account name is on screen`);
  assert(found.theme === theme, `${label}: theme is ${found.theme}, expected ${theme}`);
  assert(!found.install, `${label}: the install banner is showing`);
  assert(!found.banner, `${label}: a match banner is showing`);
}

let converter;
const written = [];

/** Encodes in the browser, so the run needs nothing installed beyond Playwright. */
async function toWebp(png) {
  const dataUrl = await converter.evaluate(
    async ({ source, quality }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d").drawImage(image, 0, 0);
      return canvas.toDataURL("image/webp", quality);
    },
    { source: `data:image/png;base64,${png.toString("base64")}`, quality: WEBP_QUALITY },
  );
  assert(dataUrl.startsWith("data:image/webp;"), "this Chromium can't encode WebP");
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

async function shoot(page, { theme, step, device }) {
  const name = `tutorial-${theme}-${step}-${device}`;
  await settle(page, name);
  await dismissToasts(page);
  await sleep(300);
  await assertClean(page, name, theme);
  const png = await page.screenshot({ timeout: 15_000 });
  writeFileSync(join(OUT, "png", `${name}.png`), png);
  const webp = await toWebp(png);
  const file = join(IMAGE_DIR, `${name}.webp`);
  writeFileSync(file, webp);
  written.push({ file, bytes: webp.length });
  console.log(`SHOT  ${name}.webp ${Math.round(webp.length / 1024)} KB`);
}

async function goHome(page, home, device) {
  await page.goto(`${BASE_URL}${home}`);
  await onPath(page, home);
  const poster = topCard(page).locator("img.deck-card__poster");
  await poster.waitFor();
  await page.waitForFunction((image) => image.complete && image.naturalWidth > 0, await poster.elementHandle());
  if (device === "desktop") await settledWatch(page, page.locator(".deck-panel"));
  // The card deals in with a short animation.
  await sleep(800);
}

async function settledWatch(page, scope) {
  const watch = scope.locator(".where-to-watch");
  await watch.waitFor();
  await page.waitForFunction((element) => !element.querySelector('[role="status"]'), await watch.elementHandle());
  return watch;
}

/** Phone: the details sheet with its trailer playing. Desktop: the side panel. */
async function openDetails(page, device) {
  if (device === "desktop") return page.locator(".deck-panel");
  await page.locator('.deck-card--depth-0 button[aria-label^="Details for"]').click();
  const sheet = page.getByRole("dialog", { name: / details$/ });
  await settledWatch(page, sheet);
  await sheet.locator("iframe.deck-details__video").waitFor();
  return sheet;
}

/** Brings an element into view inside whatever scrolls around it. */
async function reveal(locator, block) {
  await locator.evaluate((element, where) => element.scrollIntoView({ block: where, inline: "nearest" }), block);
  await sleep(500);
}

/**
 * Pretends Alex has linked Plex Request, in this browser context only. Status comes back
 * as missing and requestable; anything that would change Plex is answered here.
 */
function plexFake(mode) {
  let profile = null;
  const status = { availability: "NOT_IN_LIBRARY", canRequest: true, missingSeasons: null, seasonCount: mode === "TV" ? 4 : null };
  const linked = (value) => {
    if (Array.isArray(value)) value.forEach(linked);
    else if (value && typeof value === "object") {
      if ("plexLinked" in value) value.plexLinked = true;
      if (typeof value.id === "string" && typeof value.code === "string" && "plexAvailable" in value) value.plexAvailable = true;
      Object.values(value).forEach(linked);
    }
  };
  return async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();
    const op = opOf(request);
    const local = {
      PlexStatus: () => ({ plexStatus: { ...status, ...(variablesOf(request).mediaType === "TV" ? { seasonCount: 4 } : {}) } }),
      RequestOnPlex: () => ({ requestOnPlex: { availability: "REQUESTED", canRequest: false, missingSeasons: null, seasonCount: null } }),
      StartPlexLink: () => ({ startPlexLink: { sent: true } }),
      ConfirmPlexLink: () => ({ confirmPlexLink: { ...profile, plexLinked: true } }),
      UnlinkPlex: () => ({ unlinkPlex: { ...profile, plexLinked: false } }),
    };
    if (local[op]) return route.fulfill({ json: { data: local[op]() } });
    const response = await route.fetch();
    const json = await response.json();
    if (json.data) linked(json.data);
    if (json.data?.me) profile = json.data.me;
    return route.fulfill({ response, json });
  };
}

const SHOTS = {
  async deck(page, { home }, device) {
    await goHome(page, home, device);
  },
  async details(page, { home }, device) {
    await goHome(page, home, device);
    const scope = await openDetails(page, device);
    if (device === "desktop") {
      // Otherwise the panel is the same picture as the deck step.
      await scope.getByRole("button", { name: "Play Trailer" }).click();
      await scope.locator("iframe.deck-details__video").waitFor();
    }
    // Long enough for the player to draw a frame and hide its start-up controls.
    await sleep(7_000);
  },
  async filters(page, { mode, home }) {
    const path = mode === "TV" ? "/shows/filters" : "/filters";
    await page.goto(`${BASE_URL}${path}`);
    const genres = page.getByRole("group", { name: "Genres" });
    await genres.getByRole("button").first().waitFor();
    await genres.getByRole("button", { name: mode === "TV" ? "Drama" : "Comedy", exact: true }).click();
    if (mode === "TV") {
      const commitment = page.getByRole("group", { name: "Commitment Level" });
      await commitment.getByRole("button", { name: /A Few Seasons/ }).click();
    }
    await page.waitForFunction(() => !document.body.innerText.includes("Counting…"), null, { timeout: TIMEOUT_MS });
    // A press scrolls its chip into view; the shot should open on the genres.
    await genres.evaluate((element) => {
      for (let node = element.parentElement; node; node = node.parentElement) node.scrollTop = 0;
      window.scrollTo(0, 0);
    });
    // The pointer stays where the last press was, and after the scroll it would hover
    // some other chip. The page title is a spot with no hover style.
    await page.mouse.move(200, 60);
    await sleep(400);
    assert(new URL(page.url()).pathname === path, `filters left for ${page.url()} (home is ${home})`);
  },
  async invite(page, { home }, device) {
    await goHome(page, home, device);
    await page.getByRole("button", { name: /^Room code .+ Invite someone$/ }).first().click();
    await page.locator("img.deck-invite__qr").waitFor();
    await sleep(600);
  },
  async join(page, { home }, device) {
    await goHome(page, home, device);
    await page.getByRole("button", { name: "Join Room", exact: true }).click();
    await page.getByRole("dialog", { name: "Join Room" }).waitFor();
    await sleep(600);
  },
  async members(page) {
    await page.goto(`${BASE_URL}/members`);
    await page.locator(".members__row").nth(2).waitFor();
    assert((await page.locator(".members__row").count()) === 3, "Members should list Alex, Sam and Jordan");
    await page.locator(".members__row .room-avatar__image").nth(2).waitFor();
  },
  async settings(page) {
    await page.goto(`${BASE_URL}/settings`);
    await page.getByText("Matches Required").first().waitFor();
  },
  async history(page, { mode }) {
    await page.goto(`${BASE_URL}/history?tab=matches${mode === "TV" ? "&media=shows" : ""}`);
    await page.locator("#history-panel-matches .history-stub").nth(1).waitFor();
  },
  async plex(page, { home }, device) {
    await goHome(page, home, device);
    const scope = await openDetails(page, device);
    const panel = scope.locator(".plex-status");
    await panel.getByText("Not on Plex").waitFor();
    await panel.getByRole("button", { name: "Request on Plex" }).waitFor();
    await reveal(panel, "center");
    if (device === "phone") await sleep(7_000);
  },
  async install(page) {
    await page.goto(`${BASE_URL}/install`);
    await page.getByText("Put Movie Date on your home screen", { exact: false }).waitFor();
  },
};

async function capture(contexts, themeInfo, step) {
  for (const device of ["phone", "desktop"]) {
    const context = contexts[device];
    const fake = step === "plex" ? plexFake(themeInfo.mode) : null;
    if (fake) await context.route(GRAPHQL_URL, fake);
    const page = await shotPage(context, themeInfo.mode);
    try {
      await SHOTS[step](page, themeInfo, device);
      await shoot(page, { theme: themeInfo.theme, step, device });
    } finally {
      await page.close();
      if (fake) await context.unroute(GRAPHQL_URL, fake);
    }
  }
}

/** The match screen has to be taken while it's this round's match, before nextRound. */
async function captureMatch(contexts, themeInfo, path) {
  if (!wanted("match")) return;
  for (const device of ["phone", "desktop"]) {
    const page = await shotPage(contexts[device], themeInfo.mode);
    try {
      await page.goto(`${BASE_URL}${path}`);
      await page.getByRole("heading", { name: themeInfo.mode === "TV" ? "It's Official" : "Match Found" }).waitFor();
      await page.locator(".match-details__poster").waitFor();
      await settledWatch(page, page.locator("body"));
      // The confetti has fallen by then.
      await sleep(3_500);
      await shoot(page, { theme: themeInfo.theme, step: "match", device });
    } finally {
      await page.close();
    }
  }
}

// ---------------------------------------------------------------- run

async function main() {
  mkdirSync(join(OUT, "png"), { recursive: true });
  mkdirSync(IMAGE_DIR, { recursive: true });
  saveState();
  console.log(`run ${runId}, output in ${OUT}`);

  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
  const browser = await chromium.launch({ headless: !process.env.E2E_HEADED });
  try {
    converter = await (await browser.newContext()).newPage();

    const people = [];
    for (const { name, colour } of PEOPLE) {
      const person = new Person(name, colour, await newContext(browser, "seed"));
      await person.open();
      people.push(person);
    }
    const [alex, sam, jordan] = people;

    for (const person of people) {
      await register(person);
      await setProfile(person);
      console.log(`SEED  ${person.name} registered`);
    }
    await alex.page.goto(`${BASE_URL}/`);
    const code = (await alex.page.locator(".deck-ticket-strip__code").textContent())?.trim() ?? "";
    assert(/^[A-Z2-9]{6}$/.test(code), `room code looks wrong: ${code}`);
    await joinRoom(sam, code);
    await joinRoom(jordan, code);
    await jordan.page.close();
    console.log("SEED  Sam and Jordan joined Alex's room");

    const storageState = await alex.context.storageState();
    const contexts = {
      phone: await newContext(browser, "phone", storageState),
      desktop: await newContext(browser, "desktop", storageState),
    };

    for (const themeInfo of THEMES) {
      for (const person of [alex, sam]) {
        await person.page.goto(`${BASE_URL}${themeInfo.home}`);
        await topCard(person.page).waitFor();
      }
      const matched = [];
      for (let round = 1; round <= 2; round += 1) {
        const match = await makeMatch(alex, sam, themeInfo, matched);
        matched.push(match.title);
        console.log(`SEED  ${themeInfo.theme} match ${round}: "${match.title}"`);
        if (round === 1) await captureMatch(contexts, themeInfo, match.path);
        await nextRound(alex, sam, themeInfo);
      }
      const passes = await passToGoodCard(alex, themeInfo);
      console.log(`SEED  Alex passed ${passes} ${themeInfo.theme}`);
    }
    await sam.page.close();
    await alex.page.close();

    for (const themeInfo of THEMES) {
      for (const step of STEPS) {
        if (step === "match" || !wanted(step)) continue;
        await capture(contexts, themeInfo, step);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

let cleaningUp = false;
async function finish(fatal) {
  if (cleaningUp) return;
  cleaningUp = true;
  if (fatal) console.error(`FAIL  ${redact(fatal.stack ?? fatal)}`);
  // e2e-live owns the cleanup, so there's one place that knows what a run leaves behind.
  let leftBehind = false;
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [join(REPO, "scripts/e2e-live.mjs"), "--cleanup", join(OUT, "state.json")],
      { env: { ...process.env, AWS_PROFILE: process.env.AWS_PROFILE ?? "league-szn" }, maxBuffer: 16 * 1024 * 1024 },
    );
    console.log(redact(stdout.trim()));
  } catch (error) {
    leftBehind = true;
    console.error(redact(`${error.stdout ?? ""}${error.stderr ?? ""}` || error.message));
  }
  console.log(`\n${written.length} images written to ${IMAGE_DIR}`);
  if (leftBehind) process.exit(2);
  process.exit(fatal ? 1 : 0);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => void finish(new Error(`interrupted by ${signal}`)));
}
let fatal;
try {
  await main();
} catch (error) {
  fatal = error;
} finally {
  await finish(fatal);
}
