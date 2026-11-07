#!/usr/bin/env node
/**
 * Repeatable end-to-end run against the LIVE Movie Date site.
 *
 * Drives isolated phone-sized browser contexts through the real stack (Cognito,
 * AppSync over HTTP and websocket, TMDB, the streaming API, S3), then deletes
 * everything it created: Cognito users, USER#/ROOM#/CODE# rows, avatars.
 *
 * The Plex steps also create a temporary user in Plex Request's real pool, with no
 * user-preferences row, so auto-approve is off. Mail: only an admin status change
 * sends Plex Request's status mail, so a request left at "requested" sends none, and
 * the user is created with its invite suppressed. Linking does send two code mails. The
 * actors who link use SES's mailbox simulator, so those mails are accepted and go nowhere:
 * no bounce, no feedback forwarded, nothing on the suppression list. Codes can't be read
 * there, so the script rewrites the stored hash for a known code. That needs AWS access,
 * not an app backdoor.
 * The request exists for seconds and is deleted, along with the user, whatever happens.
 *
 *   AWS_PROFILE=league-szn PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
 *     node scripts/e2e-live.mjs
 *
 * Playwright is not a dependency of this repo. Either install it where Node can
 * resolve it, or point PLAYWRIGHT_MODULE at an install whose browser is present.
 *
 * Options (environment):
 *   E2E_OUT            Results and screenshots. Default: <os tmpdir>/movie-date-e2e/<runId>
 *   E2E_BASE_URL       Default: the production CloudFront URL
 *   E2E_HEADED=1       Show the browsers
 *
 * Recovery, if a run was killed before its finally block:
 *   node scripts/e2e-live.mjs --cleanup <E2E_OUT>/state.json
 *
 * Exit code: 0 all steps passed, 1 something failed, 2 cleanup left data behind.
 * Secrets: passwords are generated per run and never written anywhere. Tokens
 * travel in websocket URLs and Authorization headers, so every string this script
 * records goes through redact().
 */
import { execFile } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const BASE_URL = (process.env.E2E_BASE_URL ?? "https://d19oka7lgeykfv.cloudfront.net").replace(/\/$/, "");
const GRAPHQL_URL = "https://nti4vfrsszdl3okpzctqiffsoy.appsync-api.us-east-1.amazonaws.com/graphql";
const USER_POOL_ID = "us-east-1_TEy3ICBCA";
const AVATAR_BUCKET = "movie-date-production-avatarsbucket-bbbbcwzc";
const AVATAR_PREFIXES = ["avatars", "pending"];
const TABLE = "movie-date-production-TableTable-bvwstdbe";
const PLEX_USER_POOL_ID = "us-east-1_5QNT47Ud7";
const PLEX_REQUESTS_TABLE = "plex-request-api-devtest-requests";
const PLEX_PREFERENCES_TABLE = "plex-request-api-devtest-user-preferences";
const PLEX_LIBRARY_TABLE = "plex-request-api-devtest-library";
const PLEX_ACTIVE_STATUSES = ["requested", "approved", "downloading"];
/** Mirrors confirmPlexLink and startPlexLink. */
const PLEX_MAX_ATTEMPTS = 5;
const PLEX_SEND_INTERVAL_MS = 60_000;
const PLEX_WRONG_CODE = "That code isn't right, or it has expired.";
const REGION = "us-east-1";
const PHONE = { width: 390, height: 844 };
const TIMEOUT_MS = 30_000;
/** How long to watch for something that must NOT happen. */
const QUIET_MS = 3_000;
const STEP_LIMIT_MS = 180_000;

const AWS_ENV = { ...process.env, AWS_PROFILE: process.env.AWS_PROFILE ?? "league-szn", AWS_REGION: REGION };

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Websocket URLs carry the id token in `header=`; presigned URLs carry signatures. */
function redact(value) {
  return String(value)
    .replace(/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]*/g, "<jwt>")
    .replace(/(wss?:\/\/[^\s'"?]+)\?[^\s'"]*/g, "$1?<redacted>")
    .replace(/(X-Amz-[A-Za-z-]+=)[^&\s'"]+/g, "$1<redacted>");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ---------------------------------------------------------------- cleanup

async function aws(args) {
  const { stdout } = await run("aws", [...args, "--region", REGION, "--output", "json"], {
    env: AWS_ENV,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.trim() ? JSON.parse(stdout) : null;
}

async function subOf(email, poolId = USER_POOL_ID) {
  try {
    const user = await aws(["cognito-idp", "admin-get-user", "--user-pool-id", poolId, "--username", email]);
    return user.UserAttributes.find((attribute) => attribute.Name === "sub")?.Value ?? null;
  } catch (error) {
    if (String(error.stderr ?? error).includes("UserNotFoundException")) return null;
    throw error;
  }
}

async function queryKeys(pk) {
  const result = await aws([
    "dynamodb", "query", "--table-name", TABLE,
    "--key-condition-expression", "pk = :pk",
    "--expression-attribute-values", JSON.stringify({ ":pk": { S: pk } }),
    "--projection-expression", "pk, sk, code, roomId",
  ]);
  return result.Items;
}

async function deleteKeys(items) {
  for (let start = 0; start < items.length; start += 25) {
    const requests = items
      .slice(start, start + 25)
      .map(({ pk, sk }) => ({ DeleteRequest: { Key: { pk, sk } } }));
    let pending = { [TABLE]: requests };
    while (Object.keys(pending).length > 0) {
      const result = await aws(["dynamodb", "batch-write-item", "--request-items", JSON.stringify(pending)]);
      pending = result.UnprocessedItems ?? {};
    }
  }
}

/** Rooms any of these users is still in. Only ever matches this run's subs. */
async function roomsWithMembers(subs) {
  if (subs.length === 0) return [];
  const values = Object.fromEntries(subs.map((sub, index) => [`:m${index}`, { S: `MEMBER#${sub}` }]));
  const result = await aws([
    "dynamodb", "scan", "--table-name", TABLE,
    "--filter-expression", `sk IN (${Object.keys(values).join(", ")})`,
    "--expression-attribute-values", JSON.stringify(values),
    "--projection-expression", "pk",
  ]);
  return result.Items.map((item) => item.pk.S.replace(/^ROOM#/, ""));
}

// Plex Request is live with real users, so nothing here acts on an address this
// script didn't make, or on a row that isn't that user's.
function assertTestAddress(email) {
  assert(
    /^(e2e-live-[0-9a-f]+-\w+@example\.com|success\+e2e-live-[0-9a-f]+-\w+@simulator\.amazonses\.com)$/.test(email),
    `refusing to touch ${email}`,
  );
}

async function plexRequestIdsOf(sub) {
  const result = await aws([
    "dynamodb", "query", "--table-name", PLEX_REQUESTS_TABLE, "--index-name", "UserIndex",
    "--key-condition-expression", "userId = :userId",
    "--expression-attribute-values", JSON.stringify({ ":userId": { S: sub } }),
    "--projection-expression", "requestId",
  ]);
  return result.Items.map((item) => item.requestId.S);
}

async function plexRequest(requestId) {
  const result = await aws([
    "dynamodb", "get-item", "--table-name", PLEX_REQUESTS_TABLE, "--consistent-read",
    "--key", JSON.stringify({ requestId: { S: requestId } }),
  ]);
  return result?.Item ?? null;
}

async function deletePlexRequest(requestId, sub) {
  try {
    await aws([
      "dynamodb", "delete-item", "--table-name", PLEX_REQUESTS_TABLE,
      "--key", JSON.stringify({ requestId: { S: requestId } }),
      "--condition-expression", "userId = :userId",
      "--expression-attribute-values", JSON.stringify({ ":userId": { S: sub } }),
    ]);
  } catch (error) {
    // Already gone, which is the state this was after. A row of someone else's stays put.
    if (!String(error.stderr ?? error).includes("ConditionalCheckFailed")) throw error;
  }
}

async function plexPreference(sub) {
  const result = await aws([
    "dynamodb", "get-item", "--table-name", PLEX_PREFERENCES_TABLE, "--consistent-read",
    "--key", JSON.stringify({ userId: { S: sub } }),
  ]);
  return result?.Item ?? null;
}

async function cleanupPlex(state) {
  const log = [];
  const leftovers = [];
  const emails = state.plexEmails ?? [];
  emails.forEach(assertTestAddress);
  const subs = new Set(state.plexSubs ?? []);
  for (const email of emails) {
    const sub = await subOf(email, PLEX_USER_POOL_ID);
    if (sub) subs.add(sub);
  }

  for (const sub of subs) {
    // The index lags a fresh write, so the ids noted during the run count too.
    const requestIds = new Set([...(state.plexRequestIds ?? []), ...(await plexRequestIdsOf(sub))]);
    for (const requestId of requestIds) {
      await deletePlexRequest(requestId, sub);
      const row = await plexRequest(requestId);
      if (row?.userId?.S === sub) leftovers.push(`plex request ${requestId}`);
      else log.push(`plex request ${requestId}: deleted`);
    }
    await aws([
      "dynamodb", "delete-item", "--table-name", PLEX_PREFERENCES_TABLE,
      "--key", JSON.stringify({ userId: { S: sub } }),
    ]);
    if (await plexPreference(sub)) leftovers.push(`plex preference ${sub}`);
  }
  for (const email of emails) {
    try {
      await aws(["cognito-idp", "admin-delete-user", "--user-pool-id", PLEX_USER_POOL_ID, "--username", email]);
      log.push(`plex cognito ${email}: deleted`);
    } catch (error) {
      if (!String(error.stderr ?? error).includes("UserNotFoundException")) throw error;
    }
    if (await subOf(email, PLEX_USER_POOL_ID)) leftovers.push(`plex cognito ${email}`);
  }
  return { log, leftovers };
}

/** Deletes exactly what `state` names, then checks nothing is left. */
async function cleanup(state) {
  const { log, leftovers } = await cleanupPlex(state);
  const subs = new Set(state.subs ?? []);
  for (const email of state.emails) {
    const sub = await subOf(email);
    if (sub) subs.add(sub);
  }

  const rooms = new Set(state.rooms ?? []);
  const codes = new Set(state.codes ?? []);
  for (const roomId of await roomsWithMembers([...subs])) rooms.add(roomId);
  for (const sub of subs) {
    for (const item of await queryKeys(`USER#${sub}`)) {
      if (item.roomId?.S) rooms.add(item.roomId.S);
    }
  }

  for (const roomId of rooms) {
    const items = await queryKeys(`ROOM#${roomId}`);
    for (const item of items) if (item.code?.S) codes.add(item.code.S);
    await deleteKeys(items);
    log.push(`room ${roomId}: ${items.length} rows`);
  }
  for (const code of codes) {
    await deleteKeys(await queryKeys(`CODE#${code}`));
  }
  for (const sub of subs) {
    const items = await queryKeys(`USER#${sub}`);
    await deleteKeys(items);
    log.push(`user ${sub}: ${items.length} rows`);
    for (const prefix of AVATAR_PREFIXES) {
      await run(
        "aws",
        ["s3", "rm", `s3://${AVATAR_BUCKET}/${prefix}/${sub}/`, "--recursive", "--region", REGION],
        { env: AWS_ENV },
      );
    }
  }
  for (const email of state.emails) {
    try {
      await aws(["cognito-idp", "admin-delete-user", "--user-pool-id", USER_POOL_ID, "--username", email]);
      log.push(`cognito ${email}: deleted`);
    } catch (error) {
      if (!String(error.stderr ?? error).includes("UserNotFoundException")) throw error;
    }
  }

  for (const email of state.emails) if (await subOf(email)) leftovers.push(`cognito ${email}`);
  for (const sub of subs) {
    if ((await queryKeys(`USER#${sub}`)).length > 0) leftovers.push(`USER#${sub}`);
    for (const prefix of AVATAR_PREFIXES) {
      const listed = await aws([
        "s3api", "list-objects-v2", "--bucket", AVATAR_BUCKET, "--prefix", `${prefix}/${sub}/`, "--max-items", "1",
      ]);
      if (listed?.Contents?.length) leftovers.push(`s3 ${prefix}/${sub}/`);
    }
  }
  for (const roomId of rooms) if ((await queryKeys(`ROOM#${roomId}`)).length > 0) leftovers.push(`ROOM#${roomId}`);
  for (const code of codes) if ((await queryKeys(`CODE#${code}`)).length > 0) leftovers.push(`CODE#${code}`);
  return { log, leftovers };
}

// ---------------------------------------------------------------- run state

const runId = randomBytes(4).toString("hex");
const OUT = process.env.E2E_OUT ?? join(tmpdir(), "movie-date-e2e", runId);

const state = { runId, emails: [], subs: [], rooms: [], codes: [], plexEmails: [], plexSubs: [], plexRequestIds: [] };
const saveState = () => writeFileSync(join(OUT, "state.json"), JSON.stringify(state, null, 2));
const remember = (list, value) => {
  if (value && !list.includes(value)) {
    list.push(value);
    saveState();
  }
};

const results = [];
const noise = { console: [], pageErrors: [], requestFailed: [], httpErrors: [], graphqlErrors: [] };
const failedSteps = new Set();
const passedSteps = new Set();
let currentStep = "setup";
let expectedNoise = null;
const actors = [];

function recordNoise(kind, entry) {
  const text = redact(entry.text);
  noise[kind].push({
    ...entry,
    text,
    step: currentStep,
    expected: expectedNoise ? expectedNoise.test(text) : false,
  });
}

/** Marks deliberate failures (a wrong password) so they aren't counted as defects. */
async function expectingNoise(pattern, action) {
  expectedNoise = pattern;
  try {
    return await action();
  } finally {
    await sleep(300);
    expectedNoise = null;
  }
}

/** Leaving a page cancels whatever it had in flight, which is the script's doing, not a fault. */
function leavingPage(action) {
  return expectingNoise(/net::ERR_ABORTED$/, action);
}

function opOf(request) {
  try {
    const { query } = JSON.parse(request.postData() ?? "{}");
    return /(?:query|mutation)\s+(\w+)/.exec(query ?? "")?.[1] ?? "unknown";
  } catch {
    return "unknown";
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

class Actor {
  constructor(name, context, { receivesMail = false } = {}) {
    this.name = name;
    this.context = context;
    this.frames = [];
    this.loads = 0;
        this.password = randomBytes(12).toString("base64url");
    const localPart = `e2e-live-${runId}-${name.toLowerCase()}`;
    this.email = receivesMail ? `success+${localPart}@simulator.amazonses.com` : `${localPart}@example.com`;
    remember(state.emails, this.email);
    actors.push(this);
  }

  async open() {
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(TIMEOUT_MS);
    this.wire(this.page);
  }

  wire(page) {
    const who = this.name;
    page.on("load", () => {
      this.loads += 1;
    });
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        recordNoise("console", {
          actor: who,
          level: message.type(),
          text: message.text(),
          source: redact(message.location()?.url ?? ""),
          url: redact(page.url()),
        });
      }
    });
    page.on("pageerror", (error) => recordNoise("pageErrors", { actor: who, text: error.stack ?? error.message }));
    page.on("requestfailed", async (request) => {
      // Chromium reports a fetch whose body was never read as aborted, even after a
      // good reply. S3's empty 204 to the avatar POST is one; that isn't a failure.
      const reply = await request.response().catch(() => null);
      if (reply && reply.status() < 400 && request.failure()?.errorText === "net::ERR_ABORTED") return;
      recordNoise("requestFailed", {
        actor: who,
        text: `${request.method()} ${request.url().split("?")[0]} ${request.failure()?.errorText ?? ""}`,
        resource: request.resourceType(),
        op: request.url() === GRAPHQL_URL ? opOf(request) : undefined,
      });
    });
    page.on("request", (request) => {
      // Memory only: this is a live id token, and it never reaches the results.
      if (request.url() === GRAPHQL_URL && request.headers().authorization) {
        this.authorization = request.headers().authorization;
      }
    });
    page.on("response", async (response) => {
      const request = response.request();
      if (response.status() >= 400) {
        recordNoise("httpErrors", {
          actor: who,
          text: `${response.status()} ${request.method()} ${response.url().split("?")[0]}`,
          op: response.url() === GRAPHQL_URL ? opOf(request) : undefined,
        });
      }
      if (response.url() !== GRAPHQL_URL || request.method() !== "POST") return;
      try {
        const body = await response.json();
        collectRooms(body.data);
        if (body.data?.me?.id) remember(state.subs, body.data.me.id);
        for (const error of body.errors ?? []) {
          recordNoise("graphqlErrors", {
            actor: who,
            op: opOf(request),
            text: `${opOf(request)}: ${error.errorType ?? ""} ${error.message ?? ""}`,
          });
        }
      } catch {
        // The body is gone if the page navigated first; nothing to read then.
      }
    });
    page.on("websocket", (socket) => {
      if (!socket.url().includes("appsync-realtime-api")) return;
      socket.on("framereceived", ({ payload }) => {
        try {
          const message = JSON.parse(String(payload));
          if (message.type === "ka") return;
          this.frames.push({
            at: Date.now(),
            type: message.type,
            event: message.payload?.data?.onRoomEvent ?? null,
            errors: message.payload?.errors ? redact(JSON.stringify(message.payload.errors)) : undefined,
          });
        } catch {
          // Not JSON, so not a protocol frame.
        }
      });
    });
  }

  async mark() {
    await this.page.evaluate(() => {
      window.__e2eMark = true;
    });
  }

  async assertNoReload(what) {
    const intact = await this.page.evaluate(() => window.__e2eMark === true);
    assert(intact, `${this.name}: page fully reloaded during ${what}`);
  }

  async waitFrame(predicate, since, description, timeout = TIMEOUT_MS) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const frame = this.frames.find((candidate) => candidate.at >= since && predicate(candidate));
      if (frame) return frame;
      if (Date.now() > deadline) {
        const seen = this.frames.filter((candidate) => candidate.at >= since).map((candidate) => candidate.event?.type ?? candidate.type);
        throw new Error(`${this.name}: no websocket frame "${description}" within ${timeout}ms; saw [${seen.join(", ")}]`);
      }
      await sleep(50);
    }
  }

  waitEvent(type, since, timeout) {
    return this.waitFrame((frame) => frame.event?.type === type, since, type, timeout);
  }

  waitLive(since) {
    return this.waitFrame((frame) => frame.type === "start_ack", since, "start_ack");
  }

  waitOp(op, predicate = () => true) {
    return this.page.waitForResponse(
      async (response) => {
        if (response.url() !== GRAPHQL_URL || response.request().method() !== "POST") return false;
        if (opOf(response.request()) !== op) return false;
        return predicate(await response.json().catch(() => null));
      },
      { timeout: TIMEOUT_MS },
    );
  }

  async cdp() {
    this.cdpSession ??= await this.context.newCDPSession(this.page);
    return this.cdpSession;
  }
}

async function newActor(browser, name, options) {
  const context = await browser.newContext({
    viewport: PHONE,
    screen: PHONE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
    locale: "en-US",
    timezoneId: "America/New_York",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  // Playwright's close event is not a reliable witness; the page's own sockets are.
  await context.addInitScript(() => {
    const NativeSocket = window.WebSocket;
    window.__e2eSockets = [];
    window.WebSocket = new Proxy(NativeSocket, {
      construct(target, args) {
        const socket = new target(...args);
        if (String(args[0]).includes("appsync-realtime-api")) window.__e2eSockets.push(socket);
        return socket;
      },
    });
  });
  const actor = new Actor(name, context, options);
  await actor.open();
  return actor;
}

async function screenshot(actor, label) {
  try {
    const file = join(OUT, `${label.replace(/[^\w-]+/g, "_").slice(0, 60)}-${actor.name}.png`);
    await actor.page.screenshot({ path: file, timeout: 5_000 });
    return file;
  } catch {
    return null;
  }
}

/**
 * One checked behaviour. A failure is recorded and the run carries on, because
 * later steps often don't depend on it. Steps that do name it in `requires`, and
 * are then reported as skipped rather than failing for someone else's reason.
 */
async function step(name, options, action) {
  const body = action ?? options;
  const requires = action ? (options.requires ?? []) : [];
  const blocked = requires.filter((dependency) => !passedSteps.has(dependency));
  if (blocked.length > 0) {
    results.push({ name, status: "skipped", detail: `needs: ${blocked.join(", ")}` });
    console.log(`SKIP  ${name} (needs: ${blocked.join(", ")})`);
    return;
  }
  currentStep = name;
  const started = Date.now();
  const notes = [];
  let timer;
  try {
    await Promise.race([
      body((note) => notes.push(redact(note))),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`step exceeded ${STEP_LIMIT_MS}ms`)), STEP_LIMIT_MS);
      }),
    ]);
    passedSteps.add(name);
    results.push({ name, status: "passed", ms: Date.now() - started, notes });
    console.log(`PASS  ${name} (${Date.now() - started}ms)${notes.length ? ` :: ${notes.join(" | ")}` : ""}`);
  } catch (error) {
    failedSteps.add(name);
    const shots = [];
    for (const actor of actors) {
      const file = await screenshot(actor, `fail-${name}`);
      if (file) shots.push(file);
    }
    const message = redact(error.message ?? error).split("\n").slice(0, 8).join(" / ");
    results.push({ name, status: "failed", ms: Date.now() - started, error: message, notes, shots });
    console.log(`FAIL  ${name} :: ${message}`);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- page actions

const homePath = (page) => new URL(page.url()).pathname;
const onPath = (actor, path) => actor.page.waitForURL((url) => url.pathname === path);
const onMatch = (actor) => actor.page.waitForURL((url) => url.pathname.startsWith("/match/"));

async function register(actor) {
  const { page } = actor;
  // The URL changes a beat before React swaps the form, and Login has an EMAIL field too.
  await page.getByLabel("CONFIRM PASSWORD", { exact: true }).waitFor();
  await page.getByLabel("EMAIL", { exact: true }).fill(actor.email);
  await page.getByLabel("PASSWORD", { exact: true }).fill(actor.password);
  await page.getByLabel("CONFIRM PASSWORD", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Register" }).click();
}

async function logIn(actor, password = actor.password) {
  const { page } = actor;
  await page.getByLabel("EMAIL", { exact: true }).fill(actor.email);
  await page.getByLabel("PASSWORD", { exact: true }).fill(password);
  await page.getByRole("button", { name: "LOG IN" }).click();
}

async function drawerTo(actor, label) {
  const { page } = actor;
  // On a phone, Filters is a full-screen sheet over the app bar.
  const filters = page.getByRole("dialog", { name: "Filters" });
  if (await filters.count()) await filters.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: label, exact: true }).click();
}

const topCard = (actor) => actor.page.locator(".deck-card--depth-0");

async function topTitle(actor) {
  return (await topCard(actor).locator(".deck-card__title").textContent({ timeout: TIMEOUT_MS }))?.trim() ?? "";
}

async function roomCode(actor) {
  return (await actor.page.locator(".deck-ticket-strip__code").textContent({ timeout: TIMEOUT_MS }))?.trim() ?? "";
}

/** Presses Like or Pass and returns the server's SwipeResult. */
async function pressSwipe(actor, label) {
  const response = actor.waitOp("Swipe");
  await actor.page.getByRole("button", { name: label, exact: true }).click();
  const body = await (await response).json();
  assert(!body.errors, `${actor.name}: ${label} returned ${JSON.stringify(body.errors)}`);
  return body.data.swipe;
}

/** A real finger drag: pointer events the way a phone produces them, not a click. */
async function touchDrag(actor, deltaX, whileHeld) {
  const box = await topCard(actor).boundingBox();
  assert(box, "no top card to drag");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const cdp = await actor.cdp();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y: startY }] });
  const moves = 12;
  for (let index = 1; index <= moves; index += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: startX + (deltaX * index) / moves, y: startY + index }],
    });
    await sleep(16);
  }
  await whileHeld?.();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** Records what a tap really does, so "the sheet didn't open" comes with a reason. */
async function recordTap(actor, performTap) {
  const { page } = actor;
  await page.evaluate(() => {
    const log = [];
    const started = performance.now();
    const add = (entry) => log.push(`${Math.round(performance.now() - started)}ms ${entry}`);
    const types = ["pointerdown", "pointerup", "pointercancel", "click"];
    const listener = (event) => {
      const className = typeof event.target?.className === "string" ? event.target.className : "";
      add(`${event.type} on ${className.split(" ")[0] || event.target?.tagName}`);
    };
    for (const type of types) window.addEventListener(type, listener, true);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) if (node.classList?.contains("md-sheet")) add("SHEET MOUNTED");
        for (const node of mutation.removedNodes) if (node.classList?.contains("md-sheet")) add("SHEET UNMOUNTED");
      }
    });
    observer.observe(document.body, { childList: true });
    window.__e2eTap = {
      log,
      stop: () => {
        observer.disconnect();
        for (const type of types) window.removeEventListener(type, listener, true);
      },
    };
  });
  await performTap();
  await sleep(1_500);
  return page.evaluate(() => {
    window.__e2eTap.stop();
    return {
      log: window.__e2eTap.log,
      open: document.querySelector(".md-sheet") !== null,
    };
  });
}

/** Finger down, a human-length pause, finger up. */
async function touchTap(actor, x, y) {
  const cdp = await actor.cdp();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await sleep(80);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function closeSheet(page) {
  const close = page.locator(".md-sheet").getByRole("button", { name: "Close" });
  if (await close.count()) await close.click();
  await page.locator(".md-sheet").waitFor({ state: "hidden" });
}

async function assertStays(actor, predicate, description) {
  const deadline = Date.now() + QUIET_MS;
  while (Date.now() < deadline) {
    assert(predicate(actor.page), `${actor.name}: ${description}; now at ${actor.page.url()}`);
    await sleep(100);
  }
}

async function assertNoOverflow(actor, where) {
  const { scrollWidth, innerWidth } = await actor.page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  assert(scrollWidth <= innerWidth, `${where}: page is ${scrollWidth}px wide in a ${innerWidth}px viewport`);
}

async function assertPosterLoaded(actor) {
  const image = topCard(actor).locator("img.deck-card__poster");
  await image.waitFor();
  await actor.page.waitForFunction(
    (element) => element.complete,
    await image.elementHandle(),
    { timeout: TIMEOUT_MS },
  );
  const { src, naturalWidth } = await image.evaluate((element) => ({
    src: element.currentSrc,
    naturalWidth: element.naturalWidth,
  }));
  assert(src.startsWith("https://image.tmdb.org/t/p/w780"), `poster src is ${src}`);
  assert(naturalWidth > 100, `poster did not decode (naturalWidth ${naturalWidth})`);
  return { src, naturalWidth };
}

/** Replaces the room's genre filter. `drop` is whatever genre is selected now. */
async function setGenre(actor, drop, pick) {
  const { page } = actor;
  await page.getByRole("link", { name: "Search" }).click();
  await onPath(actor, "/filters");
  const genres = page.getByRole("group", { name: "Genres" });
  if (drop) await genres.getByRole("button", { name: drop, exact: true }).click();
  await genres.getByRole("button", { name: pick, exact: true }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
}

async function assertMatchScreen(actor) {
  const { page } = actor;
  await page.getByRole("heading", { name: "Match Found" }).waitFor();
  const heading = await page.locator(".match-details__title").textContent();
  const overview = await page.locator(".match-details__overview").textContent();
  const facts = await page.locator(".match-details__fact").allTextContents();
  const poster = page.locator(".match-details__poster");
  await poster.waitFor();
  assert((overview ?? "").length > 10, `${actor.name}: match screen has no overview`);
  assert(facts.some((fact) => fact.includes("min")), `${actor.name}: no runtime in [${facts.join(", ")}]`);
  assert(facts.some((fact) => fact.includes("/10")), `${actor.name}: no rating in [${facts.join(", ")}]`);
  assert(/, \d{4}$/.test(heading ?? ""), `${actor.name}: no year in "${heading}"`);
  return heading?.trim() ?? "";
}

/** Waits for Where to Watch to settle and returns what it shows. */
async function readWhereToWatch(actor, scope) {
  const section = scope.locator(".where-to-watch");
  await section.waitFor();
  await actor.page.waitForFunction(
    (element) => !element.querySelector('[role="status"]'),
    await section.elementHandle(),
    { timeout: TIMEOUT_MS },
  );
  const tiles = section.locator(".where-to-watch__tile");
  const logos = await section.locator("img.where-to-watch__logo").evaluateAll(async (images) => {
    await Promise.all(images.map((image) => (image.complete ? null : new Promise((done) => {
      image.onload = done;
      image.onerror = done;
    }))));
    return images.map((image) => ({ name: image.alt, width: image.naturalWidth, src: image.currentSrc }));
  });
  const links = await section.locator("a.where-to-watch__tile").evaluateAll((anchors) => anchors.map((anchor) => anchor.href));
  return {
    tiles: await tiles.count(),
    logos,
    links,
    errorShown: (await section.getByText("Couldn't load streaming options").count()) > 0,
    empty: (await section.getByText("Not streaming right now").count()) > 0,
    justWatch: (await section.getByText("JustWatch").count()) > 0,
  };
}

let realWatchOptionsSeen = false;
function noteWatch(watch, note, who) {
  const brokenLogos = watch.logos.filter((logo) => logo.width === 0);
  note(`${who}: ${watch.tiles} tiles [${watch.logos.map((logo) => logo.name).join(", ")}]${watch.justWatch ? " via JustWatch fallback" : ""}`);
  assert(!watch.errorShown, `${who}: Where to Watch shows an error`);
  assert(brokenLogos.length === 0, `${who}: logos failed to load: ${brokenLogos.map((logo) => `${logo.name} ${logo.src}`).join(", ")}`);
  if (watch.tiles > 0) realWatchOptionsSeen = true;
}

async function backToStart(actor) {
  await actor.page.getByRole("button", { name: "Back to Start" }).click();
  await onPath(actor, "/");
}

// ---------------------------------------------------------------- Plex helpers

async function createPlexUser(email) {
  assertTestAddress(email);
  // Noted first: a run killed between these calls must still clean the user up.
  remember(state.plexEmails, email);
  const created = await aws([
    "cognito-idp", "admin-create-user", "--user-pool-id", PLEX_USER_POOL_ID, "--username", email,
    "--message-action", "SUPPRESS",
    "--user-attributes", `Name=email,Value=${email}`, "Name=email_verified,Value=true",
  ]);
  const sub = created.User.Attributes.find((attribute) => attribute.Name === "sub")?.Value;
  remember(state.plexSubs, sub);
  try {
    await aws([
      "cognito-idp", "admin-set-user-password", "--user-pool-id", PLEX_USER_POOL_ID, "--username", email,
      "--password", `Aa1-${randomBytes(18).toString("base64url")}`, "--permanent",
    ]);
  } catch {
    // execFile's own message quotes the command line, password included.
    throw new Error("could not confirm the temporary Plex Request user");
  }
  return sub;
}

async function plexUserState(email) {
  const user = await aws(["cognito-idp", "admin-get-user", "--user-pool-id", PLEX_USER_POOL_ID, "--username", email]);
  const verified = user.UserAttributes.find((attribute) => attribute.Name === "email_verified")?.Value;
  return { status: user.UserStatus, verified };
}

async function userRow(sub, sk) {
  const result = await aws([
    "dynamodb", "get-item", "--table-name", TABLE, "--consistent-read",
    "--key", JSON.stringify({ pk: { S: `USER#${sub}` }, sk: { S: sk } }),
  ]);
  return result?.Item ?? null;
}

/** The only thing this does to the app: swaps the hash of a code nobody can read. */
async function plantLinkCode(sub, code) {
  const pending = await userRow(sub, "PLEX_LINK");
  assert(pending, "no pending link code to replace");
  await aws([
    "dynamodb", "update-item", "--table-name", TABLE,
    "--key", JSON.stringify({ pk: { S: `USER#${sub}` }, sk: { S: "PLEX_LINK" } }),
    "--update-expression", "SET codeHash = :codeHash",
    "--condition-expression", "salt = :salt",
    "--expression-attribute-values", JSON.stringify({
      ":codeHash": { S: scryptSync(code, pending.salt.S, 32).toString("hex") },
      ":salt": { S: pending.salt.S },
    }),
  ]);
}

/** For what the UI rightly gives no way to attempt. Bypasses the page, so it records no noise. */
async function callApi(actor, query, variables = {}) {
  assert(actor.authorization, `${actor.name} has made no API call yet`);
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: actor.authorization },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

const PLEX_STATUS_QUERY = "query Status($id: Int!) { plexStatus(movieId: $id) { availability canRequest } }";
const REQUEST_ON_PLEX = "mutation Ask($id: Int!) { requestOnPlex(movieId: $id) { availability canRequest } }";
const START_PLEX_LINK = "mutation Start { startPlexLink { sent } }";

async function libraryFiles(tmdbIds) {
  const keys = [...new Set(tmdbIds)].map((tmdbId) => ({ pk: { S: `movie#${tmdbId}` } }));
  const result = await aws([
    "dynamodb", "batch-get-item", "--request-items",
    JSON.stringify({ [PLEX_LIBRARY_TABLE]: { Keys: keys, ProjectionExpression: "pk, hasFile" } }),
  ]);
  return new Map(
    result.Responses[PLEX_LIBRARY_TABLE].map((row) => [Number(row.pk.S.replace("movie#", "")), row.hasFile?.BOOL === true]),
  );
}

async function activeRequestCount(tmdbId) {
  let total = 0;
  for (const status of PLEX_ACTIVE_STATUSES) {
    const result = await aws([
      "dynamodb", "query", "--table-name", PLEX_REQUESTS_TABLE, "--index-name", "StatusIndex",
      "--key-condition-expression", "#status = :status",
      "--filter-expression", "tmdbId = :tmdbId",
      "--expression-attribute-names", JSON.stringify({ "#status": "status" }),
      "--expression-attribute-values", JSON.stringify({ ":status": { S: status }, ":tmdbId": { N: String(tmdbId) } }),
      "--select", "COUNT",
    ]);
    total += result.Count;
  }
  return total;
}

async function serviceTiles(actor) {
  const { page } = actor;
  if (homePath(page) !== "/filters") {
    const search = page.getByRole("link", { name: "Search" });
    // Only the routes with a bottom nav have it.
    if ((await search.count()) === 0) {
      await drawerTo(actor, "Home");
      await onPath(actor, "/");
    }
    await search.click();
    await onPath(actor, "/filters");
  }
  const tiles = page.getByRole("group", { name: "Streaming Services" });
  await tiles.waitFor();
  return tiles;
}

const plexTile = (tiles) => tiles.getByRole("button", { name: /^Plex/ });

async function submitLinkCode(actor, code) {
  const answer = actor.waitOp("ConfirmPlexLink");
  await actor.page.getByLabel("6-digit code").fill(code);
  await actor.page.getByRole("button", { name: "Link Account" }).click();
  return (await answer).json();
}

/** Opens the top card's sheet and returns what the status panel settled on. */
async function openPlexStatus(actor) {
  const { page } = actor;
  const title = (await topTitle(actor)).replace(/, \d{4}$/, "");
  const statusCall = actor.waitOp("PlexStatus");
  await page.getByRole("button", { name: `Details for ${title}` }).click();
  const sheet = page.getByRole("dialog", { name: `${title} details` });
  await sheet.waitFor();
  const response = await statusCall;
  const movieId = JSON.parse(response.request().postData()).variables.movieId;
  const status = (await response.json()).data.plexStatus;
  await sheet.locator(".plex-status__badge").waitFor();
  return { title, sheet, movieId, status, badge: (await sheet.locator(".plex-status__badge").textContent())?.trim() };
}

// ---------------------------------------------------------------- the journey

async function checkStaticPwa(note) {
  const manifestResponse = await fetch(`${BASE_URL}/manifest.webmanifest`);
  assert(manifestResponse.ok, `manifest returned ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  assert(manifest.display === "standalone", `display is ${manifest.display}`);
  assert(manifest.start_url === "/", `start_url is ${manifest.start_url}`);
  assert(manifest.name === "Movie Date", `name is ${manifest.name}`);
  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert(sizes.includes("192x192") && sizes.includes("512x512"), `icon sizes ${sizes}`);
  assert(manifest.icons.some((icon) => icon.purpose === "maskable"), "no maskable icon");
  for (const icon of manifest.icons) {
    const response = await fetch(`${BASE_URL}/${icon.src}`);
    const type = response.headers.get("content-type");
    assert(response.ok && type === "image/png", `${icon.src}: ${response.status} ${type}`);
  }
  const worker = await fetch(`${BASE_URL}/sw.js`);
  assert(worker.ok, `sw.js returned ${worker.status}`);
  assert(/javascript/.test(worker.headers.get("content-type") ?? ""), `sw.js type ${worker.headers.get("content-type")}`);
  const workerCache = worker.headers.get("cache-control") ?? "";
  assert(/max-age=0|no-cache|no-store/.test(workerCache), `sw.js cache-control "${workerCache}" would pin old versions`);
  const html = await (await fetch(`${BASE_URL}/`)).text();
  assert(html.includes('rel="manifest"'), "index.html does not link the manifest");
  const deepLink = await fetch(`${BASE_URL}/join/ABCDEF`);
  assert(deepLink.ok, `a cold deep link returned ${deepLink.status}`);
  assert((await deepLink.text()).includes('id="root"'), "deep link did not serve the app shell");
  note(`manifest ok, ${manifest.icons.length} icons, sw cache-control "${workerCache}"`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  saveState();
  console.log(`run ${runId}, output in ${OUT}`);

  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
  const browser = await chromium.launch({ headless: !process.env.E2E_HEADED });

  try {
    const A = await newActor(browser, "A");
    const B = await newActor(browser, "B");
    let C;
    let code = "";
    let filmOne = "";

    await step("PWA static assets", checkStaticPwa);

    await step("register A", async (note) => {
      await A.page.goto(`${BASE_URL}/`);
      await onPath(A, "/login");
      await A.page.getByRole("link", { name: /Sign up/ }).click();
      await onPath(A, "/register");
      await register(A);
      await onPath(A, "/tutorial");
      note("sign-up logged straight in and went to the tutorial");
    });

    await step("tutorial walkthrough", { requires: ["register A"] }, async () => {
      const { page } = A;
      for (let index = 1; index <= 5; index += 1) {
        await page.getByRole("heading", { name: `Tutorial, step ${index} of 6` }).waitFor();
        await page.getByRole("button", { name: "Next" }).click();
      }
      await page.getByRole("heading", { name: "Tutorial, step 6 of 6" }).waitFor();
      await page.getByRole("button", { name: "Prev" }).click();
      await page.getByRole("heading", { name: "Tutorial, step 5 of 6" }).waitFor();
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByRole("button", { name: "Finish" }).click();
      await onPath(A, "/");
      const seen = await page.evaluate(() => localStorage.getItem("hasSeenTutorial"));
      assert(seen === "true", `hasSeenTutorial is ${seen}`);
    });

    await step("real deck renders posters", { requires: ["tutorial walkthrough"] }, async (note) => {
      const poster = await assertPosterLoaded(A);
      const title = await topTitle(A);
      const stacked = await A.page.locator(".deck-card").count();
      const overview = await topCard(A).locator(".deck-card__overview").textContent();
      const meta = await topCard(A).locator(".deck-card__meta").allTextContents();
      assert(title.length > 0, "top card has no title");
      assert(stacked === 3, `expected a stack of 3 cards, found ${stacked}`);
      assert((overview ?? "").length > 10, "top card has no overview");
      assert(meta.length >= 1, "top card has no genres or facts");
      code = await roomCode(A);
      assert(/^[A-Z2-9]{6}$/.test(code), `room code looks wrong: ${code}`);
      await assertNoOverflow(A, "home");
      const layout = await A.page.evaluate(() => {
        const like = document.querySelector(".deck__control--like")?.getBoundingClientRect();
        const nav = document.querySelector(".md-bottom-nav")?.getBoundingClientRect();
        return { likeBottom: like?.bottom, navTop: nav?.top, height: window.innerHeight };
      });
      assert(layout.likeBottom <= layout.navTop, `deck controls run under the bottom nav: ${JSON.stringify(layout)}`);
      await screenshot(A, "deck");
      note(`"${title}" ${poster.naturalWidth}px wide; room ${code}`);
    });

    await step("register B and skip tutorial", async () => {
      await B.page.goto(`${BASE_URL}/register`);
      await register(B);
      await onPath(B, "/tutorial");
      await B.page.getByRole("button", { name: "Skip" }).click();
      await onPath(B, "/");
      await assertPosterLoaded(B);
      assert((await roomCode(B)) !== code, "B was given A's room");
    });

    const bothRegistered = ["real deck renders posters", "register B and skip tutorial"];

    await step("unknown room code is refused", { requires: bothRegistered }, async () => {
      await expectingNoise(/JoinRoom/, async () => {
        await B.page.getByRole("button", { name: "Join Room" }).click();
        await B.page.getByLabel("Enter Room Code").fill("ZZZZZZ");
        await B.page.getByRole("button", { name: "Submit" }).click();
        await B.page.getByText("Invalid room code").waitFor();
      });
      await B.page.getByRole("button", { name: "Cancel" }).click();
    });

    await step("join by room code, MEMBERS_CHANGED live", { requires: bothRegistered }, async (note) => {
      await drawerTo(A, "Room Members");
      await onPath(A, "/members");
      await A.page.getByRole("heading", { name: "Members (1)" }).waitFor();
      await A.mark();
      await B.mark();
      const since = Date.now();
      const toast = A.page.getByText(/joined the room/).waitFor({ timeout: TIMEOUT_MS });
      await B.page.getByRole("button", { name: "Join Room" }).click();
      await B.page.getByLabel("Enter Room Code").fill(code.toLowerCase());
      await B.page.getByRole("button", { name: "Submit" }).click();
      await B.page.locator(".deck-ticket-strip__code", { hasText: code }).waitFor();
      const frame = await A.waitEvent("MEMBERS_CHANGED", since);
      await A.page.getByRole("heading", { name: "Members (2)" }).waitFor();
      await toast;
      await A.assertNoReload("MEMBERS_CHANGED");
      await B.waitLive(since);
      const text = await A.page.locator(".members__list").textContent();
      assert(!text?.includes("@"), `member list shows an email: ${text}`);
      note(`A's list updated ${Date.now() - frame.at}ms after the event frame`);
    });

    const inRoom = ["join by room code, MEMBERS_CHANGED live"];

    await step("invite sheet offers link and QR", { requires: inRoom }, async () => {
      const { page } = A;
      await drawerTo(A, "Home");
      await onPath(A, "/");
      await page.getByRole("button", { name: /Room code/ }).click();
      await page.locator(".deck-invite__link", { hasText: `${BASE_URL}/join/${code}` }).waitFor();
      const qr = page.locator("img.deck-invite__qr");
      await qr.waitFor();
      assert((await qr.evaluate((image) => image.naturalWidth)) > 100, "QR image did not render");
      await page.getByRole("button", { name: "Copy Link" }).click();
      await page.getByText("Invite link copied").waitFor();
      await page.getByRole("button", { name: "Close" }).click();
    });

    await step("card tap opens the details sheet", { requires: inRoom }, async (note) => {
      const { page } = A;
      await topCard(A).waitFor();
      const box = await topCard(A).boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const quick = await recordTap(A, () => page.touchscreen.tap(x, y));
      await closeSheet(page);
      const held = await recordTap(A, () => touchTap(A, x, y));
      await closeSheet(page);
      // Where the sheet's panel ends up decides what the follow-up click lands on.
      const low = await recordTap(A, () => touchTap(A, x, box.y + box.height * 0.9));
      await closeSheet(page);
      // The info button: a mouse click can't stand in for this, as the two differ.
      const infoBox = await topCard(A).locator(".deck-card__info").boundingBox();
      const infoX = infoBox.x + infoBox.width / 2;
      const infoY = infoBox.y + infoBox.height / 2;
      const info = await recordTap(A, () => touchTap(A, infoX, infoY));
      await closeSheet(page);
      const mouse = await recordTap(A, () => page.mouse.click(x, y));
      await closeSheet(page);
      note(`instant tap: ${quick.log.join(", ")}`);
      note(`80ms press: ${held.log.join(", ")}`);
      note(`80ms press low on the card: ${low.log.join(", ")}`);
      note(`80ms press on the info button: ${info.log.join(", ")}`);
      note(`mouse click: ${mouse.log.join(", ")}`);
      assert(
        quick.open && held.open && low.open && info.open && mouse.open,
        `sheet still open after a tap: instant ${quick.open}, 80ms ${held.open}, low on card ${low.open}, info button ${info.open}; mouse ${mouse.open}`,
      );
    });

    await step("details sheet plays a real trailer", { requires: inRoom }, async (note) => {
      const { page } = A;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const title = (await topTitle(A)).replace(/, \d{4}$/, "");
        await page.getByRole("button", { name: `Details for ${title}` }).click();
        const sheet = page.getByRole("dialog", { name: `${title} details` });
        await sheet.waitFor();
        const frame = sheet.locator("iframe.deck-details__video");
        const missing = sheet.getByText("No trailer available");
        await frame.or(missing).first().waitFor();
        if (await missing.count()) {
          note(`"${title}" has no trailer, trying the next card`);
          await sheet.getByRole("button", { name: "Close" }).click();
          await pressSwipe(A, "Pass");
          continue;
        }
        const src = await frame.getAttribute("src");
        const videoId = /^https:\/\/www\.youtube-nocookie\.com\/embed\/([\w-]+)\?autoplay=1$/.exec(src ?? "")?.[1];
        assert(videoId, `trailer src is ${src}`);
        const oembed = await fetch(
          `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${videoId}`,
        );
        assert(oembed.ok, `YouTube says video ${videoId} is not real: ${oembed.status}`);
        const video = await oembed.json();
        await page.waitForFunction(
          (id) => performance.getEntriesByType("resource").some((entry) => entry.name.includes(`/embed/${id}`)),
          videoId,
          { timeout: TIMEOUT_MS },
        );
        await sleep(1_500);
        await screenshot(A, "trailer");
        await sheet.getByRole("button", { name: "Close" }).click();
        await sheet.waitFor({ state: "hidden" });
        assert((await topTitle(A)).startsWith(title), "opening the sheet moved the deck on");
        note(`"${title}" -> ${videoId} "${video.title}"`);
        return;
      }
      throw new Error("five cards in a row had no trailer");
    });

    await step("filter change reloads the other user's deck", { requires: inRoom }, async (note) => {
      await B.mark();
      const since = Date.now();
      const bDeck = B.waitOp("Deck");
      const aDeck = A.waitOp("Deck");
      await setGenre(A, null, "Comedy");
      await onPath(A, "/");
      const frame = await B.waitEvent("ROOM_UPDATED", since);
      const body = await (await bDeck).json();
      await aDeck;
      const cards = body.data.deck.cards;
      assert(cards.length > 0, "B's reloaded deck is empty");
      const off = cards.filter(({ movie }) => !movie.genres.includes("Comedy"));
      assert(off.length === 0, `not Comedy: ${off.map(({ movie }) => movie.title).join(", ")}`);
      await B.page.locator(".deck-card--depth-0 .deck-card__title", { hasText: cards[0].movie.title }).waitFor();
      const meta = (await topCard(B).locator(".deck-card__meta").allTextContents()).join(" ");
      assert(meta.includes("Comedy"), `B's top card meta: ${meta}`);
      await assertPosterLoaded(B);
      await B.assertNoReload("ROOM_UPDATED");
      const aTop = await topTitle(A);
      const bTop = await topTitle(B);
      assert(aTop === bTop, `same filters, different decks: A "${aTop}", B "${bTop}"`);
      note(`B reloaded to "${bTop}", ${cards.length} cards, ${Date.now() - frame.at}ms after the event`);
    });

    const decksAligned = ["filter change reloads the other user's deck"];

    await step("undo restores the card and its like", { requires: decksAligned }, async (note) => {
      filmOne = await topTitle(A);
      const liked = await pressSwipe(A, "Like");
      assert(!liked.match, "a lone like matched");
      assert((await topTitle(A)) !== filmOne, "the deck did not advance after Like");
      const undoResponse = A.waitOp("UndoSwipe");
      await A.page.getByRole("button", { name: "Undo", exact: true }).click();
      const undo = await (await undoResponse).json();
      assert(undo.data?.undoSwipe?.undone === true, `undoSwipe: ${JSON.stringify(undo)}`);
      await A.page.locator(".deck-card--depth-0 .deck-card__title", { hasText: filmOne }).waitFor();
      assert((await topTitle(A)) === filmOne, "the undone card is not back on top");

      // The real test of the tally: if the like survived, B's like would match.
      assert((await topTitle(B)) === filmOne, "B's top card differs from A's");
      const swipeResponse = B.waitOp("Swipe");
      await touchDrag(B, 240, async () => {
        await B.page.locator(".deck-card__overlay--like", { hasText: "Watch Movie" }).waitFor({ timeout: 5_000 });
      });
      const body = await (await swipeResponse).json();
      assert(body.data?.swipe?.direction === "LIKE", `touch swipe sent ${JSON.stringify(body)}`);
      assert(!body.data.swipe.match, "undo left the like in the tally: B's single like matched");
      await assertStays(B, (page) => homePath(page) === "/", "B left the deck with only one like");
      const scrolled = await B.page.evaluate(() => window.scrollY + document.scrollingElement.scrollTop);
      assert(scrolled === 0, `a drag scrolled the page by ${scrolled}px`);
      note(`undo of "${filmOne}" removed the like; B's real touch drag showed the overlay and sent LIKE`);
    });

    let matchPath = "";
    let socketSamples = [];
    let forgotReplies = [];
    await step("both land on match screen via websocket", { requires: ["undo restores the card and its like"] }, async (note) => {
      await A.mark();
      await B.mark();
      const since = Date.now();
      const swiped = await pressSwipe(A, "Like");
      assert(swiped.match, `A's like should complete the match: ${JSON.stringify(swiped)}`);
      await onMatch(A);
      const frame = await B.waitEvent("MATCH_FOUND", since);
      await onMatch(B);
      const landed = Date.now();
      assert(homePath(A.page) === homePath(B.page), `different match pages: ${A.page.url()} ${B.page.url()}`);
      matchPath = homePath(B.page);
      assert(frame.event.matchId === swiped.match.id, "event and swipe disagree on the match");
      const [aHeading, bHeading] = await Promise.all([assertMatchScreen(A), assertMatchScreen(B)]);
      assert(aHeading === bHeading, `A sees "${aHeading}", B sees "${bHeading}"`);
      assert(aHeading === filmOne, `matched "${aHeading}", expected "${filmOne}"`);
      await A.assertNoReload("match");
      await B.assertNoReload("match");
      await assertNoOverflow(B, "match screen");
      await screenshot(B, "match");
      note(`B routed ${landed - since}ms after A's like, no reload; "${bHeading}"`);
    });

    const matched = ["both land on match screen via websocket"];

    await step("Where to Watch on the match screen", { requires: matched }, async (note) => {
      noteWatch(await readWhereToWatch(A, A.page), note, "A");
      noteWatch(await readWhereToWatch(B, B.page), note, "B");
    });

    await step("Back to Start", { requires: matched }, async (note) => {
      await A.mark();
      await B.mark();
      const since = Date.now();
      const reset = A.waitOp("StartNewRound");
      await backToStart(A);
      const room = (await (await reset).json()).data.startNewRound;
      assert(room.round === 2, `round is ${room.round} after Back to Start`);
      await B.waitEvent("ROUND_RESET", since);
      await assertStays(B, (page) => homePath(page) === matchPath, "B was pulled off the match screen");
      const secondPress = B.waitOp("StartNewRound");
      await backToStart(B);
      const stillRound = (await (await secondPress).json()).data.startNewRound.round;
      assert(stillRound === 2, `B's press advanced the round to ${stillRound}`);
      await B.page.locator(".deck-card--depth-0 .deck-card__title", { hasText: filmOne }).waitFor();
      await A.page.locator(".deck-card--depth-0 .deck-card__title", { hasText: filmOne }).waitFor();
      await assertStays(A, (page) => homePath(page) === "/", "A bounced back to a match");
      await assertStays(B, (page) => homePath(page) === "/", "B bounced back to a match");
      assert(await A.page.getByRole("button", { name: "Undo", exact: true }).isDisabled(), "Undo offered in a new round");
      await B.assertNoReload("round reset");
      note("A reset to round 2; B stayed until pressing; second press was a no-op; deck restarted");
    });

    await step("match history", { requires: matched }, async (note) => {
      const { page } = B;
      await drawerTo(B, "History");
      await onPath(B, "/history");
      const row = page.locator("#history-panel-matches .history-stub").first();
      await row.waitFor();
      const text = await row.textContent();
      assert(text?.includes(filmOne.replace(/, \d{4}$/, "")), `history row: ${text}`);
      assert(/Round.1/.test(text ?? ""), `history row has no round 1: ${text}`);
      await row.click();
      const sheet = page.getByRole("dialog", { name: /details/ });
      await sheet.waitFor();
      noteWatch(await readWhereToWatch(B, sheet), note, "B history");
      await sheet.getByRole("button", { name: "Close" }).click();
      await page.getByRole("tab", { name: "My Swipes" }).click();
      const swipes = page.locator("#history-panel-swipes .history-row");
      await swipes.first().waitFor();
      const texts = await swipes.allTextContents();
      assert(texts.some((swipe) => swipe.includes("Liked")), `no liked swipe in ${texts.join(" / ")}`);
      await assertNoOverflow(B, "history");
      note(`${texts.length} swipes listed`);
      await drawerTo(B, "Home");
      await onPath(B, "/");
    });

    await step("leave room removes the like, updates the roommate live", { requires: matched }, async (note) => {
      const film = await topTitle(B);
      assert(film === (await topTitle(A)), "decks differ at the start of round 2");
      const liked = await pressSwipe(B, "Like");
      assert(!liked.match, "B's like matched alone");

      await drawerTo(A, "Room Members");
      await onPath(A, "/members");
      await A.page.getByRole("heading", { name: "Members (2)" }).waitFor();
      await A.mark();
      await drawerTo(B, "Room Members");
      await onPath(B, "/members");
      const since = Date.now();
      const toast = A.page.getByText(/left the room/).waitFor({ timeout: TIMEOUT_MS });
      await B.page.getByRole("button", { name: "Leave Room" }).click();
      await B.page.getByRole("button", { name: "Leave", exact: true }).click();
      await onPath(B, "/");
      await B.page.getByText("You left the room").waitFor();
      await A.waitEvent("MEMBERS_CHANGED", since);
      await A.page.getByRole("heading", { name: "Members (1)" }).waitFor();
      await toast;
      await A.assertNoReload("member leaving");
      const newCode = await roomCode(B);
      assert(newCode !== code, "B kept the old room code");
      await B.waitLive(since);

      await drawerTo(A, "Home");
      await onPath(A, "/");
      assert((await topTitle(A)) === film, "A's top card changed");
      const after = await pressSwipe(A, "Like");
      assert(!after.match, "a departed member's like still counted toward a match");
      await assertStays(A, (page) => homePath(page) === "/", "A matched with someone who left");
      note(`B moved to ${newCode}; A's like on "${film}" did not match on B's departed like`);
    });

    await step("invite link join, roommate's like surfaces first", { requires: ["leave room removes the like, updates the roommate live"] }, async (note) => {
      const since = Date.now();
      await B.page.goto(`${BASE_URL}/join/${code}`);
      await B.page.getByRole("heading", { name: `Join room ${code}?` }).waitFor();
      const toast = A.page.getByText(/joined the room/).waitFor({ timeout: TIMEOUT_MS });
      await B.page.getByRole("button", { name: "Join Room" }).first().click();
      await onPath(B, "/");
      await B.page.locator(".deck-ticket-strip__code", { hasText: code }).waitFor();
      await A.waitEvent("MEMBERS_CHANGED", since);
      await toast;
      await topCard(B).locator(".deck-card__badge", { hasText: "A roommate liked this" }).waitFor();
      await B.waitLive(since);

      await A.mark();
      const eventSince = Date.now();
      const swiped = await pressSwipe(B, "Like");
      assert(swiped.match, `B's like on A's film should match: ${JSON.stringify(swiped)}`);
      await onMatch(B);
      await A.waitEvent("MATCH_FOUND", eventSince);
      await onMatch(A);
      await A.assertNoReload("second match");
      const heading = await assertMatchScreen(A);
      noteWatch(await readWhereToWatch(A, A.page), note, "A");
      await backToStart(B);
      await backToStart(A);
      note(`second match "${heading}" reached A over the websocket`);
    });

    await step("avatar uploads through S3 and displays", { requires: ["register A"] }, async (note) => {
      const { page } = A;
      await drawerTo(A, "Profile");
      await onPath(A, "/profile");
      const png = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 900;
        canvas.height = 600;
        const context = canvas.getContext("2d");
        context.fillStyle = "#ff5f6d";
        context.fillRect(0, 0, 900, 600);
        context.fillStyle = "#ffc371";
        context.fillRect(300, 100, 300, 400);
        return canvas.toDataURL("image/png").split(",")[1];
      });
      await page.getByLabel("Choose a profile photo").setInputFiles({
        name: "e2e.png",
        mimeType: "image/png",
        buffer: Buffer.from(png, "base64"),
      });
      await page.locator('.room-avatar-picker img[src^="blob:"]').waitFor();
      const upload = page.waitForResponse(
        (response) => response.url().includes(AVATAR_BUCKET) && response.request().method() === "POST",
        { timeout: TIMEOUT_MS },
      );
      const saved = A.waitOp("UpdateProfile");
      await page.getByLabel("Display Name").fill("E2E Ann");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      const uploaded = await upload;
      assert(uploaded.status() === 204 || uploaded.status() === 201, `S3 POST returned ${uploaded.status()}`);
      const profile = (await (await saved).json()).data.updateProfile;
      await page.getByText("Profile saved!").waitFor();
      const url = profile.avatarUrl;
      assert(url?.includes(AVATAR_BUCKET), `avatarUrl is ${url}`);
      const fetched = await fetch(url);
      assert(fetched.ok, `public avatar returned ${fetched.status}`);
      assert(fetched.headers.get("content-type") === "image/jpeg", `avatar type ${fetched.headers.get("content-type")}`);

      await page.reload();
      await page.locator(".room-avatar__image").waitFor();
      const width = await page.locator(".room-avatar__image").evaluate(async (image) => {
        await image.decode();
        return image.naturalWidth;
      });
      assert(width === 512, `avatar is ${width}px, expected 512`);

      await drawerTo(B, "Room Members");
      await onPath(B, "/members");
      const row = B.page.locator(".members__row", { hasText: "E2E Ann" });
      await row.waitFor();
      const shown = await row.locator(".room-avatar__image").evaluate(async (image) => {
        await image.decode();
        return image.naturalWidth;
      });
      assert(shown === 512, `B sees a ${shown}px avatar`);
      note(`S3 ${uploaded.status()}, served image/jpeg at 512px, visible to B`);
    });

    await step("forgot password request", { requires: ["register A"] }, async (note) => {
      const context = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(TIMEOUT_MS);
        const replies = [];
        page.on("response", async (response) => {
          if (response.url().includes("cognito-idp")) {
            const target = response.request().headers()["x-amz-target"] ?? "";
            if (target.includes("ForgotPassword")) {
              const body = await response.json().catch(() => ({}));
              replies.push({ status: response.status(), type: body.__type, message: body.message });
            }
          }
        });
        await page.goto(`${BASE_URL}/login`);
        await page.getByRole("link", { name: "Forgot password?" }).click();
        await page.getByRole("button", { name: "Send Code" }).waitFor();
        await page.getByLabel("EMAIL", { exact: true }).fill(A.email);
        await page.getByRole("button", { name: "Send Code" }).click();
        const sent = page.getByText(`If ${A.email} has an account, a code is on its way.`);
        const refused = page.locator(".md-toast--error");
        await sent.or(refused).first().waitFor();
        if (await refused.count()) {
          throw new Error(`forgot password refused: toast "${await refused.first().textContent()}", Cognito ${JSON.stringify(replies)}`);
        }
        await page.getByLabel("CODE", { exact: true }).waitFor();
        await page.getByLabel("NEW PASSWORD", { exact: true }).waitFor();
        assert(replies[0]?.status === 200, `Cognito replied ${JSON.stringify(replies[0])}`);

        await page.goto(`${BASE_URL}/forgot-password`);
        await page.getByLabel("EMAIL", { exact: true }).fill(`e2e-live-${runId}-nobody@example.com`);
        await page.getByRole("button", { name: "Send Code" }).click();
        await page.getByText("a code is on its way").waitFor();
        forgotReplies = replies;
      } finally {
        await context.close();
      }
    });

    await step("forgot password does not reveal which emails exist", { requires: ["forgot password request"] }, async () => {
      const [known, unknown] = forgotReplies;
      assert(
        unknown?.status === known.status,
        `the raw Cognito reply tells accounts apart: known ${known.status}, unknown ${unknown?.status} ${unknown?.type}`,
      );
    });

    await step("session persists across reload", { requires: inRoom }, async () => {
      await leavingPage(() => A.page.goto(`${BASE_URL}/`));
      await A.page.locator(".deck-ticket-strip__code", { hasText: code }).waitFor();
      await leavingPage(() => A.page.reload());
      await A.page.locator(".deck-ticket-strip__code", { hasText: code }).waitFor();
      assert(homePath(A.page) === "/", `reload went to ${A.page.url()}`);
    });

    await step("logout ends the session", { requires: inRoom }, async (note) => {
      const { page } = A;
      await page.waitForFunction(() => window.__e2eSockets.some((socket) => socket.readyState === WebSocket.OPEN));
      await page.getByRole("button", { name: "Open menu" }).click();
      const revoked = page.waitForResponse(
        (response) =>
          response.url().includes("cognito-idp") &&
          (response.request().headers()["x-amz-target"] ?? "").includes("GlobalSignOut"),
        { timeout: TIMEOUT_MS },
      );
      await page.getByRole("button", { name: "Log Out" }).click();
      await onPath(A, "/login");
      assert((await revoked).status() === 200, "Log Out did not revoke the session");
      const names = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
      const samples = [];
      for (let second = 0; second < 8; second += 1) {
        samples.push((await page.evaluate(() => window.__e2eSockets.map((socket) => socket.readyState))).map((value) => names[value]).join("+"));
        if (samples.at(-1).split("+").every((name) => name === "CLOSED")) break;
        await sleep(1_000);
      }
      socketSamples = samples;
      await page.reload();
      await page.getByRole("button", { name: "LOG IN" }).waitFor();
      assert(homePath(page) === "/login", `reload after logout went to ${page.url()}`);
      const tokens = await page.evaluate(() => Object.keys(localStorage).filter((key) => /idToken|accessToken|refreshToken/.test(key)));
      assert(tokens.length === 0, `tokens left in storage: ${tokens.length}`);
      await page.goBack().catch(() => undefined);
      await page.getByRole("button", { name: "LOG IN" }).waitFor();
      note("tokens cleared; reload and back both stay on login");
    });

    await step("websocket closes on logout", { requires: ["logout ends the session"] }, async (note) => {
      note(`readyState each second after logout: ${socketSamples.join(" | ")}`);
      assert(
        socketSamples.at(-1).split("+").every((name) => name === "CLOSED"),
        `sockets after logout, sampled each second: ${socketSamples.join(" | ")}`,
      );
    });

    await step("deep link while signed out returns after login", { requires: ["logout ends the session"] }, async () => {
      const { page } = A;
      await page.goto(`${BASE_URL}/history?tab=swipes`);
      await onPath(A, "/login");
      await expectingNoise(/cognito-idp|400/, async () => {
        await logIn(A, "wrong-password-e2e");
        await page.getByText("Incorrect email or password.").waitFor();
      });
      await logIn(A);
      await page.getByRole("tab", { name: "My Swipes", selected: true }).waitFor();
      assert(page.url() === `${BASE_URL}/history?tab=swipes`, `landed on ${page.url()}`);
    });

    await step("third user: invite deep link through sign-up", { requires: ["deep link while signed out returns after login"] }, async () => {
      C = await newActor(browser, "C");
      await drawerTo(A, "Room Members");
      await onPath(A, "/members");
      await A.page.getByRole("heading", { name: "Members (2)" }).waitFor();
      const since = Date.now();
      await C.page.goto(`${BASE_URL}/join/${code}`);
      await onPath(C, "/login");
      await C.page.getByRole("link", { name: /Sign up/ }).click();
      await onPath(C, "/register");
      await register(C);
      await onPath(C, "/tutorial");
      await C.page.getByRole("button", { name: "Skip" }).click();
      await onPath(C, `/join/${code}`);
      await C.page.getByRole("button", { name: "Join Room" }).first().click();
      await onPath(C, "/");
      await C.page.locator(".deck-ticket-strip__code", { hasText: code }).waitFor();
      await A.waitEvent("MEMBERS_CHANGED", since);
      await A.page.getByRole("heading", { name: "Members (3)" }).waitFor();
      await B.page.getByRole("heading", { name: "Members (3)" }).waitFor();
    });

    const threeInRoom = ["third user: invite deep link through sign-up"];

    await step("threshold 3 needs all three likes", { requires: threeInRoom }, async (note) => {
      await drawerTo(A, "Settings");
      await onPath(A, "/settings");
      await drawerTo(B, "Settings");
      await onPath(B, "/settings");
      const slider = A.page.locator("#settings-threshold");
      assert((await slider.getAttribute("max")) === "3", `slider max ${await slider.getAttribute("max")}`);
      await slider.fill("3");
      const since = Date.now();
      await A.page.getByRole("button", { name: "Save Settings" }).click();
      await A.page.getByText("Settings saved").waitFor();
      await B.waitEvent("ROOM_UPDATED", since);
      await B.page.locator("output.settings__value", { hasText: "3" }).waitFor();

      // New filters give all three the same untouched deck.
      await drawerTo(B, "Home");
      await onPath(B, "/");
      await drawerTo(A, "Home");
      await onPath(A, "/");
      const cDeck = C.waitOp("Deck");
      const bDeck = B.waitOp("Deck");
      await setGenre(A, "Comedy", "Drama");
      await onPath(A, "/");
      await Promise.all([cDeck, bDeck]);
      await sleep(1_000);
      const film = await topTitle(A);
      assert((await topTitle(B)) === film && (await topTitle(C)) === film, "the three decks differ");

      const first = await pressSwipe(A, "Like");
      const second = await pressSwipe(B, "Like");
      assert(!first.match && !second.match, "matched before the threshold of 3");
      await assertStays(A, (page) => homePath(page) === "/", "A matched at 2 of 3");
      await A.mark();
      await B.mark();
      const eventSince = Date.now();
      const third = await pressSwipe(C, "Like");
      assert(third.match, `the third like should match: ${JSON.stringify(third)}`);
      await onMatch(C);
      await Promise.all([A.waitEvent("MATCH_FOUND", eventSince), B.waitEvent("MATCH_FOUND", eventSince)]);
      await Promise.all([onMatch(A), onMatch(B)]);
      await A.assertNoReload("threshold 3 match");
      await B.assertNoReload("threshold 3 match");
      const heading = await assertMatchScreen(A);
      noteWatch(await readWhereToWatch(A, A.page), note, "A");
      await backToStart(C);
      await backToStart(A);
      await backToStart(B);
      note(`"${heading}" matched on the third like; A and B routed by websocket`);
    });

    await step("lowering the threshold fires a waiting match", { requires: ["threshold 3 needs all three likes"] }, async (note) => {
      await sleep(1_500);
      const film = await topTitle(A);
      assert((await topTitle(B)) === film, "A and B decks differ");
      const first = await pressSwipe(A, "Like");
      const second = await pressSwipe(B, "Like");
      assert(!first.match && !second.match, "matched below the threshold");
      await drawerTo(A, "Settings");
      await onPath(A, "/settings");
      const since = Date.now();
      await A.page.locator("#settings-threshold").fill("2");
      await A.page.getByRole("button", { name: "Save Settings" }).click();
      await Promise.all([
        A.waitEvent("MATCH_FOUND", since),
        B.waitEvent("MATCH_FOUND", since),
        C.waitEvent("MATCH_FOUND", since),
      ]);
      await Promise.all([onMatch(A), onMatch(B), onMatch(C)]);
      await assertMatchScreen(C);
      note(`"${film}" matched for all three when the threshold dropped`);
    });

    await step("Where to Watch showed real services somewhere", { requires: ["both land on match screen via websocket"] }, async () => {
      assert(realWatchOptionsSeen, "no match in this run listed a single service");
    });

    await step("service worker controls the page and shell works offline", { requires: ["register A"] }, async (note) => {
      const { page } = A;
      await leavingPage(() => page.goto(`${BASE_URL}/`));
      await page.locator(".md-app-bar").or(page.getByRole("button", { name: "LOG IN" })).first().waitFor();
      const worker = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return { state: registration.active?.state, script: registration.active?.scriptURL };
      });
      assert(worker.state === "activated", `service worker state ${worker.state}`);
      await leavingPage(() => page.reload());
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: TIMEOUT_MS });
      const cached = await page.evaluate(async () => {
        const urls = [];
        for (const name of await caches.keys()) {
          for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
        }
        return urls;
      });
      assert(cached.some((url) => url.includes("index.html")), "index.html is not precached");
      assert(!cached.some((url) => /appsync|amazonaws/.test(url)), "an API response was cached");

      const cdp = await A.cdp();
      const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
      assert(installabilityErrors.length === 0, `not installable: ${JSON.stringify(installabilityErrors)}`);

      await expectingNoise(/.*/, async () => {
        await A.context.setOffline(true);
        try {
          await page.reload();
          await page.waitForFunction(() => (document.getElementById("root")?.childElementCount ?? 0) > 0);
          await screenshot(A, "offline");
        } finally {
          await A.context.setOffline(false);
        }
      });
      note(`${cached.length} precached entries, none from the API; Chrome reports it installable; offline reload rendered the shell`);
    });

    let P;
    let Q;
    let plexSub = "";
    let linkedSub = "";
    let roommateSub = "";
    let plexSentAt = 0;
    let missing = null;
    const knownCode = String(100_000 + (randomBytes(4).readUInt32BE() % 800_000));
    const wrongCode = (offset) => String(Number(knownCode) + offset + 1);

    await step("Plex: two members in one room", async (note) => {
      P = await newActor(browser, "P", { receivesMail: true });
      Q = await newActor(browser, "Q");
      for (const actor of [P, Q]) {
        await actor.page.goto(`${BASE_URL}/register`);
        await register(actor);
        await onPath(actor, "/tutorial");
        await actor.page.getByRole("button", { name: "Skip" }).click();
        await onPath(actor, "/");
        await topCard(actor).waitFor();
      }
      const plexRoom = await roomCode(P);
      const since = Date.now();
      await Q.page.getByRole("button", { name: "Join Room" }).click();
      await Q.page.getByLabel("Enter Room Code").fill(plexRoom);
      await Q.page.getByRole("button", { name: "Submit" }).click();
      await Q.page.locator(".deck-ticket-strip__code", { hasText: plexRoom }).waitFor();
      await Q.waitLive(since);
      linkedSub = await subOf(P.email);
      roommateSub = await subOf(Q.email);
      note(`room ${plexRoom}`);
    });

    const plexRoomReady = ["Plex: two members in one room"];

    await step("Plex: temporary Plex Request account, auto-approve off", { requires: plexRoomReady }, async (note) => {
      plexSub = await createPlexUser(P.email);
      const { status, verified } = await plexUserState(P.email);
      assert(status === "CONFIRMED" && verified === "true", `user is ${status}, email_verified ${verified}`);
      assert((await plexPreference(plexSub)) === null, "a new user already has a preference row");
      note("CONFIRMED, verified, no preference row, invite mail suppressed");
    });

    const plexAccountReady = ["Plex: temporary Plex Request account, auto-approve off"];

    await step("Plex: nothing shows before anyone links", { requires: plexAccountReady }, async (note) => {
      for (const actor of [P, Q]) {
        const tiles = await serviceTiles(actor);
        await tiles.getByRole("button", { name: /^Any/ }).waitFor();
        assert((await plexTile(tiles).count()) === 0, `${actor.name} sees a Plex filter in an unlinked room`);
        const status = await callApi(actor, PLEX_STATUS_QUERY, { id: 550 });
        assert(status.data?.plexStatus === null, `${actor.name} plexStatus: ${JSON.stringify(status)}`);
      }
      const refused = await callApi(P, REQUEST_ON_PLEX, { id: 550 });
      assert(refused.errors?.length > 0 && !refused.data?.requestOnPlex, `unlinked requestOnPlex: ${JSON.stringify(refused)}`);
      note(`unlinked requestOnPlex refused: ${refused.errors[0].errorType} "${refused.errors[0].message}"`);
    });

    await step("Plex: an address with no account gets the same answer and no code", { requires: plexAccountReady }, async (note) => {
      const { page } = Q;
      await drawerTo(Q, "Profile");
      await onPath(Q, "/profile");
      const answer = Q.waitOp("StartPlexLink");
      await page.getByRole("button", { name: "Email Me a Code" }).click();
      const body = await (await answer).json();
      assert(body.data?.startPlexLink?.sent === true, `startPlexLink: ${JSON.stringify(body)}`);
      await page.getByText("a code is on its way").waitFor();
      assert((await userRow(roommateSub, "PLEX_LINK")) === null, "a code was stored for an address with no account");
      await expectingNoise(/ConfirmPlexLink/, async () => {
        const reply = await submitLinkCode(Q, knownCode);
        assert(reply.errors?.[0]?.message === PLEX_WRONG_CODE, `code with nothing pending: ${JSON.stringify(reply)}`);
        await page.getByText(PLEX_WRONG_CODE).waitFor();
      });
      await assertNoOverflow(Q, "profile");
      note("sent: true, no code row, and a guess gets the ordinary wrong-code answer");
    });

    await step("Plex: real match stores a salted hash, one send a minute", { requires: plexAccountReady }, async (note) => {
      const { page } = P;
      await drawerTo(P, "Profile");
      await onPath(P, "/profile");
      const answer = P.waitOp("StartPlexLink");
      await page.getByRole("button", { name: "Email Me a Code" }).click();
      plexSentAt = Date.now();
      const body = await (await answer).json();
      assert(body.data?.startPlexLink?.sent === true, `startPlexLink: ${JSON.stringify(body)}`);
      await page.getByText("a code is on its way").waitFor();
      const pending = await userRow(linkedSub, "PLEX_LINK");
      assert(pending, "no code row after a real match");
      assert(pending.plexUserId.S === plexSub, "the code is not bound to the Plex Request user");
      assert(pending.plexEmail.S === P.email, `code row email ${pending.plexEmail.S}`);
      assert(/^[0-9a-f]{64}$/.test(pending.codeHash.S), "stored code is not a 32-byte hash");
      assert(!pending.code, "a plain code is stored");
      assert(pending.attempts.N === "0", `attempts start at ${pending.attempts.N}`);
      const lifetime = Number(pending.expiresAt.N) - Math.floor(Date.now() / 1000);
      assert(lifetime > 540 && lifetime <= 600, `code lives ${lifetime}s, expected 10 minutes`);

      const again = await callApi(P, START_PLEX_LINK);
      assert(again.data?.startPlexLink?.sent === true, `second send: ${JSON.stringify(again)}`);
      const afterSecond = await userRow(linkedSub, "PLEX_LINK");
      assert(afterSecond.salt.S === pending.salt.S, "a second send inside the minute replaced the code");
      await plantLinkCode(linkedSub, knownCode);
      note(`code lives ${lifetime}s; a second send inside the minute changed nothing`);
    });

    const codePending = ["Plex: real match stores a salted hash, one send a minute"];

    await step("Plex: wrong codes count, and the limit stops even the right code", { requires: codePending }, async (note) => {
      const { page } = P;
      await page.getByLabel("6-digit code").fill("123");
      await page.getByRole("button", { name: "Link Account" }).click();
      await page.getByText("Enter all 6 digits").waitFor();
      assert((await userRow(linkedSub, "PLEX_LINK")).attempts.N === "0", "a short code cost an attempt");

      await expectingNoise(/ConfirmPlexLink/, async () => {
        for (let attempt = 1; attempt <= PLEX_MAX_ATTEMPTS; attempt += 1) {
          const reply = await submitLinkCode(P, wrongCode(attempt));
          assert(reply.errors?.[0]?.message === PLEX_WRONG_CODE, `wrong code ${attempt}: ${JSON.stringify(reply)}`);
          await page.getByText(PLEX_WRONG_CODE).waitFor();
          const { attempts } = await userRow(linkedSub, "PLEX_LINK");
          assert(attempts.N === String(attempt), `after ${attempt} wrong codes, attempts is ${attempts.N}`);
        }
        const blocked = await submitLinkCode(P, knownCode);
        assert(blocked.errors?.[0]?.message === PLEX_WRONG_CODE, `right code past the limit: ${JSON.stringify(blocked)}`);
      });
      const pending = await userRow(linkedSub, "PLEX_LINK");
      assert(pending.attempts.N === String(PLEX_MAX_ATTEMPTS), `attempts went to ${pending.attempts.N}`);
      assert(!(await userRow(linkedSub, "PROFILE")).plexUserId, "linked past the attempt limit");
      await screenshot(P, "plex-code-limit");
      note(`${PLEX_MAX_ATTEMPTS} wrong codes counted one each; the right code was then refused with the same message`);
    });

    await step("Plex: right code links, and the roommate's filter appears live", { requires: ["Plex: wrong codes count, and the limit stops even the right code"] }, async (note) => {
      const { page } = P;
      const tiles = await serviceTiles(Q);
      assert((await plexTile(tiles).count()) === 0, "Q sees Plex before the link");
      await Q.mark();

      await sleep(Math.max(0, plexSentAt + PLEX_SEND_INTERVAL_MS + 1_000 - Date.now()));
      const resend = page.getByRole("button", { name: "Resend Code" });
      await resend.waitFor();
      const answer = P.waitOp("StartPlexLink");
      await resend.click();
      await answer;
      const fresh = await userRow(linkedSub, "PLEX_LINK");
      assert(fresh.attempts.N === "0", `a new code starts at ${fresh.attempts.N} attempts`);
      await plantLinkCode(linkedSub, knownCode);

      const since = Date.now();
      const reply = await submitLinkCode(P, knownCode);
      assert(reply.data?.confirmPlexLink?.plexLinked === true, `right code: ${JSON.stringify(reply)}`);
      await page.getByText("Plex Request linked").waitFor();
      await page.locator(".room-plex__linked").waitFor();
      await Q.waitEvent("ROOM_UPDATED", since);
      await plexTile(tiles).waitFor();
      await Q.assertNoReload("Plex link");

      assert((await userRow(linkedSub, "PLEX_LINK")) === null, "the code survived being used");
      const profile = await userRow(linkedSub, "PROFILE");
      assert(profile.plexUserId?.S === plexSub, "profile holds the wrong Plex Request user");
      assert(!(await userRow(roommateSub, "PROFILE")).plexUserId, "Q was linked too");
      note("single-use code consumed; Q's Plex tile arrived over ROOM_UPDATED with no reload");
    });

    const plexLinked = ["Plex: right code links, and the roommate's filter appears live"];

    await step("Plex: the filter works for the whole room and yields library titles", { requires: plexLinked }, async (note) => {
      await drawerTo(P, "Home");
      await onPath(P, "/");
      const tiles = await serviceTiles(Q);
      await plexTile(tiles).click();
      const qDeck = Q.waitOp("Deck");
      const pDeck = P.waitOp("Deck");
      await Q.page.getByRole("button", { name: "Apply", exact: true }).click();
      await onPath(Q, "/");
      const body = await (await qDeck).json();
      await pDeck;
      const cards = body.data?.deck?.cards ?? [];
      assert(cards.length > 0, `Plex deck is empty: ${JSON.stringify(body.errors ?? body.data)}`);
      const ids = cards.map(({ movie }) => movie.id);
      const files = await libraryFiles(ids);
      const outside = cards.filter(({ movie }) => files.get(movie.id) !== true).map(({ movie }) => `${movie.title} (${movie.id})`);
      assert(outside.length === 0, `not in the library with a file: ${outside.join(", ")}`);
      await sleep(1_000);
      const film = await topTitle(Q);
      assert(film === (await topTitle(P)), "P and Q have different Plex decks");
      note(`an unlinked member applied it; all ${cards.length} cards are library titles with files; top "${film}"`);
    });

    await step("Plex: Where to Watch shows Plex to both members, the badge only to the linked one", { requires: ["Plex: the filter works for the whole room and yields library titles"] }, async (note) => {
      const liked = await pressSwipe(P, "Like");
      assert(!liked.match, "a lone like matched");
      const swiped = await pressSwipe(Q, "Like");
      assert(swiped.match, `the second like should match: ${JSON.stringify(swiped)}`);
      await Promise.all([onMatch(P), onMatch(Q)]);
      for (const actor of [P, Q]) {
        await actor.page.getByRole("heading", { name: "Match Found" }).waitFor();
        noteWatch(await readWhereToWatch(actor, actor.page), note, actor.name);
        const tile = actor.page.locator(".where-to-watch__tile--plex");
        assert((await tile.count()) === 1, `${actor.name}: ${await tile.count()} Plex tiles`);
        assert((await tile.textContent()).includes("Library"), `${actor.name}: Plex tile says "${await tile.textContent()}"`);
        assert((await actor.page.locator("a.where-to-watch__tile--plex").count()) === 0, `${actor.name}: the Plex tile is a link`);
      }
      const badge = P.page.locator(".plex-status__badge");
      await badge.waitFor();
      assert((await badge.textContent()).includes("On Plex"), `P's badge: ${await badge.textContent()}`);
      assert((await Q.page.locator(".plex-status").count()) === 0, "Q sees a Plex status without a link");
      for (const actor of [P, Q]) {
        assert((await actor.page.getByRole("button", { name: "Request on Plex" }).count()) === 0, `${actor.name} can request an available title`);
      }
      await screenshot(P, "plex-where-to-watch");
      await backToStart(P);
      await backToStart(Q);
    });

    await step("Plex: a missing title offers the linked member Request on Plex", { requires: plexLinked }, async (note) => {
      const tiles = await serviceTiles(P);
      await plexTile(tiles).click();
      const pDeck = P.waitOp("Deck");
      const qDeck = Q.waitOp("Deck");
      await P.page.getByRole("button", { name: "Apply", exact: true }).click();
      await onPath(P, "/");
      await Promise.all([pDeck, qDeck]);
      await sleep(1_000);

      const seen = [];
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const opened = await openPlexStatus(P);
        seen.push(opened.badge);
        if (await opened.sheet.getByRole("button", { name: "Request on Plex" }).count()) {
          assert(opened.status.availability === "NOT_IN_LIBRARY" && opened.status.canRequest, `button shown for ${JSON.stringify(opened.status)}`);
          assert(!(await libraryFiles([opened.movieId])).has(opened.movieId), `"${opened.title}" is in the library`);
          assert((await activeRequestCount(opened.movieId)) === 0, `"${opened.title}" already has an active request`);
          missing = opened;
          note(`"${opened.title}" (${opened.movieId}) after ${attempt} passes; badges seen: ${seen.join(", ")}`);
          await opened.sheet.getByRole("button", { name: "Close" }).click();
          await opened.sheet.waitFor({ state: "hidden" });
          return;
        }
        await opened.sheet.getByRole("button", { name: "Close" }).click();
        await opened.sheet.waitFor({ state: "hidden" });
        await pressSwipe(P, "Pass");
      }
      throw new Error(`no requestable title in 40 cards; badges: ${seen.join(", ")}`);
    });

    const plexTitleFound = ["Plex: a missing title offers the linked member Request on Plex"];

    await step("Plex: unlinked member has no request control and can't call it", { requires: plexTitleFound }, async (note) => {
      const { page } = Q;
      for (let attempt = 0; attempt < 45 && !(await topTitle(Q)).startsWith(missing.title); attempt += 1) {
        await pressSwipe(Q, "Pass");
      }
      assert((await topTitle(Q)).startsWith(missing.title), `Q never reached "${missing.title}"`);
      await page.getByRole("button", { name: `Details for ${missing.title}` }).click();
      const sheet = page.getByRole("dialog", { name: `${missing.title} details` });
      await sheet.waitFor();
      await sheet.locator(".deck-details__overview").waitFor();
      await sleep(QUIET_MS);
      assert((await sheet.locator(".plex-status").count()) === 0, "Q sees the Plex status panel");
      assert((await page.getByRole("button", { name: "Request on Plex" }).count()) === 0, "Q sees Request on Plex");
      await screenshot(Q, "plex-unlinked-sheet");
      await sheet.getByRole("button", { name: "Close" }).click();
      await sheet.waitFor({ state: "hidden" });

      const refused = await callApi(Q, REQUEST_ON_PLEX, { id: missing.movieId });
      assert(refused.errors?.length > 0 && !refused.data?.requestOnPlex, `Q's requestOnPlex: ${JSON.stringify(refused)}`);
      assert((await activeRequestCount(missing.movieId)) === 0, "an unlinked member created a request");
      note(`API refused Q: ${refused.errors[0].errorType} "${refused.errors[0].message}"`);
    });

    await step("Plex: Request on Plex creates exactly one request", { requires: plexTitleFound }, async (note) => {
      const { page } = P;
      const opened = await openPlexStatus(P);
      assert(opened.movieId === missing.movieId, `P's top card moved to "${opened.title}"`);
      await opened.sheet.getByRole("button", { name: "Request on Plex" }).click();
      const confirm = page.getByRole("dialog", { name: `Request ${missing.title}?` });
      await confirm.waitFor();
      await screenshot(P, "plex-request-confirm");
      await confirm.getByRole("button", { name: "Cancel" }).click();
      await confirm.waitFor({ state: "hidden" });
      assert((await activeRequestCount(missing.movieId)) === 0, "Cancel still sent the request");

      await opened.sheet.getByRole("button", { name: "Request on Plex" }).click();
      await confirm.waitFor();
      const answer = P.waitOp("RequestOnPlex");
      await confirm.getByRole("button", { name: "Request", exact: true }).click();
      const body = await (await answer).json();
      assert(body.data?.requestOnPlex?.availability === "REQUESTED", `requestOnPlex: ${JSON.stringify(body)}`);

      // The GSI lags the write. Noted the moment it shows, so cleanup never depends on the rest.
      let requestIds = [];
      for (let poll = 0; poll < 30 && requestIds.length === 0; poll += 1) {
        requestIds = await plexRequestIdsOf(plexSub);
        if (requestIds.length === 0) await sleep(500);
      }
      requestIds.forEach((requestId) => remember(state.plexRequestIds, requestId));
      assert(requestIds.length === 1, `${requestIds.length} request rows for the user`);

      await opened.sheet.locator(".plex-status__badge", { hasText: "Requested on Plex" }).waitFor();
      assert((await opened.sheet.getByRole("button", { name: "Request on Plex" }).count()) === 0, "the button survived the request");
      await page.getByText(`Requested ${missing.title} on Plex`).waitFor();
      await screenshot(P, "plex-requested");

      const repeat = await callApi(P, REQUEST_ON_PLEX, { id: missing.movieId });
      assert(repeat.data?.requestOnPlex?.availability === "REQUESTED", `repeat request: ${JSON.stringify(repeat)}`);
      await sleep(1_000);
      assert((await plexRequestIdsOf(plexSub)).length === 1, "a repeat made a second row");
      assert((await activeRequestCount(missing.movieId)) === 1, "more than one active request for the title");
      await opened.sheet.getByRole("button", { name: "Close" }).click();
      await opened.sheet.waitFor({ state: "hidden" });
      note(`one row for "${missing.title}"; a repeat answered REQUESTED with no second row`);
    });

    const plexRequested = ["Plex: Request on Plex creates exactly one request"];

    await step("Plex: no Radarr add, and auto-approve stayed off", { requires: plexRequested }, async (note) => {
      const [requestId] = state.plexRequestIds;
      const row = await plexRequest(requestId);
      assert(row, "the request row is gone");
      assert(row.userId.S === plexSub, "request belongs to someone else");
      assert(row.userName.S === P.email, `request is under ${row.userName.S}`);
      assert(row.mediaType.S === "movie", `media type ${row.mediaType.S}`);
      assert(Number(row.tmdbId.N) === missing.movieId, `request is for ${row.tmdbId.N}`);
      // Auto-approve either approves or leaves an adminNote, so all four absent means it never ran.
      assert(row.status.S === "requested", `status is ${row.status.S}`);
      assert(!row.radarrId, "the request has a radarrId");
      assert(!row.autoApproved, "the request was auto-approved");
      assert(!row.adminNote, "auto-approve was tried and failed");
      assert((await plexPreference(plexSub)) === null, "a preference row appeared for the user");
      assert(!(await libraryFiles([missing.movieId])).has(missing.movieId), "the title reached the library");
      note("status requested; no radarrId, autoApproved or adminNote; no preference row; not in the library");
    });

    await step("Plex: the request row is deleted", { requires: plexRequested }, async (note) => {
      const [requestId] = state.plexRequestIds;
      await deletePlexRequest(requestId, plexSub);
      assert((await plexRequest(requestId)) === null, "the request row is still there");
      assert((await activeRequestCount(missing.movieId)) === 0, "an active request remains");
      const status = await callApi(P, PLEX_STATUS_QUERY, { id: missing.movieId });
      assert(status.data?.plexStatus?.canRequest === true, `after delete: ${JSON.stringify(status)}`);
      note("gone from the table and the status index; the title is requestable again");
    });

    await step("Plex: unlinking takes the filter away from the room", { requires: plexLinked }, async (note) => {
      const { page } = P;
      await drawerTo(P, "Profile");
      await onPath(P, "/profile");
      const tiles = await serviceTiles(Q);
      await plexTile(tiles).waitFor();
      await Q.mark();
      const since = Date.now();
      await page.getByRole("button", { name: "Unlink" }).click();
      const answer = P.waitOp("UnlinkPlex");
      await page.getByRole("dialog", { name: "Unlink Plex Request?" }).getByRole("button", { name: "Unlink" }).click();
      const body = await (await answer).json();
      assert(body.data?.unlinkPlex?.plexLinked === false, `unlinkPlex: ${JSON.stringify(body)}`);
      await page.getByRole("button", { name: "Email Me a Code" }).waitFor();
      await Q.waitEvent("ROOM_UPDATED", since);
      await plexTile(tiles).waitFor({ state: "detached" });
      await Q.assertNoReload("Plex unlink");
      assert(!(await userRow(linkedSub, "PROFILE")).plexUserId, "the profile still holds the link");
      const status = await callApi(P, PLEX_STATUS_QUERY, { id: 550 });
      assert(status.data?.plexStatus === null, `after unlink: ${JSON.stringify(status)}`);
      note("Q's tile left live, with no reload; plexStatus is null again");
    });

    await step("Plex: the temporary account is deleted", { requires: plexAccountReady }, async (note) => {
      const { log, leftovers } = await cleanupPlex(state);
      assert(leftovers.length === 0, `left behind: ${leftovers.join(", ")}`);
      note(log.join("; "));
    });

    currentStep = "wrap-up";
    const unexpected = (entries) => entries.filter((entry) => !entry.expected);
    const dedupe = (entries) => {
      const counts = new Map();
      for (const entry of entries) {
        const key = `${entry.op ?? ""}|${entry.text}`;
        counts.set(key, { ...entry, count: (counts.get(key)?.count ?? 0) + 1 });
      }
      return [...counts.values()];
    };

    await step("no uncaught page errors", async () => {
      const errors = dedupe(unexpected(noise.pageErrors));
      assert(errors.length === 0, errors.map((entry) => `[${entry.step}] ${entry.text}`).join(" ;; "));
    });
    await step("no console errors", async () => {
      const errors = dedupe(unexpected(noise.console).filter((entry) => entry.level === "error"));
      assert(errors.length === 0, errors.map((entry) => `[${entry.step}] x${entry.count} ${entry.text}`).join(" ;; "));
    });
    await step("no failed first-party requests", async () => {
      // The embedded YouTube player cancels its own telemetry; that isn't the app's traffic.
      const firstParty = (entry) =>
        !/youtube(-nocookie)?\.com|googlevideo|doubleclick|ggpht|ytimg|www\.google\.com\/js\/th\//.test(entry.text);
      const failed = dedupe([...unexpected(noise.requestFailed), ...unexpected(noise.httpErrors)].filter(firstParty));
      assert(failed.length === 0, failed.map((entry) => `[${entry.step}] x${entry.count} ${entry.text}`).join(" ;; "));
    });
    await step("no GraphQL errors", async () => {
      const errors = dedupe(unexpected(noise.graphqlErrors));
      assert(errors.length === 0, errors.map((entry) => `[${entry.step}] x${entry.count} ${entry.text}`).join(" ;; "));
    });
  } finally {
    await browser.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------- entry

function report(cleanupResult) {
  const counts = { passed: 0, failed: 0, skipped: 0 };
  for (const result of results) counts[result.status] += 1;
  writeFileSync(
    join(OUT, "results.json"),
    JSON.stringify({ runId, baseUrl: BASE_URL, counts, results, noise, cleanup: cleanupResult }, null, 2),
  );
  console.log(`\n${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped`);
  for (const result of results.filter((candidate) => candidate.status === "failed")) {
    console.log(`  FAILED ${result.name}: ${result.error}`);
  }
  console.log(`cleanup: ${cleanupResult.leftovers.length === 0 ? "nothing left behind" : `LEFT BEHIND ${cleanupResult.leftovers.join(", ")}`}`);
  console.log(`details: ${join(OUT, "results.json")}`);
  return counts;
}

let cleaningUp = false;
async function finish(fatal) {
  if (cleaningUp) return;
  cleaningUp = true;
  let cleanupResult;
  try {
    cleanupResult = await cleanup(state);
  } catch (error) {
    cleanupResult = { log: [], leftovers: [`cleanup threw: ${redact(error.message ?? error)}`] };
  }
  const counts = report(cleanupResult);
  if (fatal) console.error(`fatal: ${redact(fatal.stack ?? fatal)}`);
  if (cleanupResult.leftovers.length > 0) process.exit(2);
  process.exit(counts.failed > 0 || fatal ? 1 : 0);
}

async function entry() {
  const cleanupFlag = process.argv.indexOf("--cleanup");
  if (cleanupFlag !== -1) {
    const saved = JSON.parse(readFileSync(process.argv[cleanupFlag + 1], "utf8"));
    const { log, leftovers } = await cleanup(saved);
    console.log(log.join("\n"));
    console.log(leftovers.length === 0 ? "nothing left behind" : `LEFT BEHIND ${leftovers.join(", ")}`);
    process.exit(leftovers.length === 0 ? 0 : 2);
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
}

await entry();
