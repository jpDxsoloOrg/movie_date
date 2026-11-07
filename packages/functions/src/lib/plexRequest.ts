import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { UpstreamError } from "./errors.js";
import { asRecord, asRecords, asText } from "./tmdb.js";

const LOOKUP_TIMEOUT_MS = 8_000;
/**
 * Approval calls Radarr or Sonarr before answering, and AppSync gives up at 30 seconds.
 * The status lookup and TMDB can spend up to 13 of those first.
 */
const CREATE_TIMEOUT_MS = 16_000;
/** Only the index job asks for this, and it has minutes to spare. */
const LIBRARY_TIMEOUT_MS = 60_000;

/** How Plex Request answers an op it doesn't have, such as one this site deployed ahead of it. */
const INVALID_INPUT = "INVALID_INPUT";

export class PlexRequestUnavailableError extends UpstreamError {
  /** The integration's own error code, when it answered at all. */
  readonly reason: string | undefined;

  constructor(reason?: string) {
    super("Plex Request is unavailable right now.");
    this.reason = reason;
  }
}

/** Giving up doesn't stop Plex Request, so a request that timed out may still have gone through. */
export function outcomeUnknown(error: PlexRequestUnavailableError): boolean {
  return error.reason === "TimeoutError" || error.reason === "AbortError";
}

export interface PlexAccount {
  userId: string;
  email: string;
}

export interface LibraryEntry {
  tmdbId: number;
  hasFile: boolean;
}

/** Sonarr's id: Plex Request keeps shows by TVDB id, not TMDB's. */
export interface ShowLibraryEntry {
  tvdbId: number;
  hasFile: boolean;
}

export interface MovieState {
  inLibrary: boolean;
  hasFile: boolean;
  hasActiveRequest: boolean;
}

interface DraftDetails {
  userId: string;
  email: string;
  title: string;
  year: string;
  overview: string;
  posterPath: string;
}

export interface MovieRequestDraft extends DraftDetails {
  tmdbId: number;
}

/** Sends the TVDB id, never `tmdbId`: Plex Request refuses a show without it. */
export interface ShowRequestDraft extends DraftDetails {
  mediaType: "tv";
  tvdbId: number;
  /** Left out for every season. */
  seasons?: number[];
}

export type RequestDraft = MovieRequestDraft | ShowRequestDraft;

type Operation =
  | { op: "findUser"; email: string }
  | { op: "libraryMovies" }
  | { op: "libraryShows" }
  | { op: "movieStatus"; tmdbId: number; userId: string }
  | { op: "showStatus"; tvdbId: number; userId: string }
  | ({ op: "createRequest" } & RequestDraft);

let client: LambdaClient | undefined;

/** One attempt: a retried createRequest could start a second download for a trusted user. */
function getClient(): LambdaClient {
  client ??= new LambdaClient({ maxAttempts: 1 });
  return client;
}

/** Only the op name is logged: payloads carry emails, and errors can echo them. */
async function invoke(operation: Operation, timeoutMs: number): Promise<unknown> {
  try {
    const functionName = process.env.PLEX_INTEGRATION_FUNCTION;
    if (!functionName) throw new Error("PLEX_INTEGRATION_FUNCTION is not set");
    const result = await getClient().send(
      new InvokeCommand({ FunctionName: functionName, Payload: JSON.stringify(operation) }),
      { abortSignal: AbortSignal.timeout(timeoutMs) },
    );
    if (result.FunctionError) throw new Error("Function error");
    const envelope = asRecord(JSON.parse(Buffer.from(result.Payload ?? []).toString("utf8")));
    if (envelope.ok !== true) {
      throw Object.assign(new Error("Rejected"), { name: asText(envelope.error) ?? "Rejected" });
    }
    return envelope.data;
  } catch (error) {
    const reason = error instanceof Error ? error.name : "unknown";
    console.error(`Plex Request ${operation.op} failed`, reason);
    throw new PlexRequestUnavailableError(reason);
  }
}

export async function findUser(email: string): Promise<PlexAccount | null> {
  const body = asRecord(await invoke({ op: "findUser", email }, LOOKUP_TIMEOUT_MS));
  const userId = asText(body.userId);
  const accountEmail = asText(body.email);
  return userId && accountEmail ? { userId, email: accountEmail } : null;
}

/** Anything but a list is a failure, never an empty library, which would wipe the index. */
export async function libraryMovies(): Promise<LibraryEntry[]> {
  const body = await invoke({ op: "libraryMovies" }, LIBRARY_TIMEOUT_MS);
  if (!Array.isArray(body)) throw new PlexRequestUnavailableError();
  return asRecords(body).flatMap(({ tmdbId, hasFile }) =>
    typeof tmdbId === "number" && Number.isInteger(tmdbId) && tmdbId > 0
      ? [{ tmdbId, hasFile: hasFile === true }]
      : [],
  );
}

/** An integration that predates this op has no shows to offer, which mustn't cost the movie index. */
export async function libraryShows(): Promise<ShowLibraryEntry[]> {
  let body: unknown;
  try {
    body = await invoke({ op: "libraryShows" }, LIBRARY_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof PlexRequestUnavailableError && error.reason === INVALID_INPUT) return [];
    throw error;
  }
  if (!Array.isArray(body)) throw new PlexRequestUnavailableError();
  return asRecords(body).flatMap(({ tvdbId, hasFile }) =>
    typeof tvdbId === "number" && Number.isInteger(tvdbId) && tvdbId > 0
      ? [{ tvdbId, hasFile: hasFile === true }]
      : [],
  );
}

function toTitleState(answer: unknown): MovieState {
  const body = asRecord(answer);
  // Reading an unexpected answer as "not in library" would offer a pointless request.
  if (typeof body.inLibrary !== "boolean") throw new PlexRequestUnavailableError();
  return {
    inLibrary: body.inLibrary,
    hasFile: body.hasFile === true,
    hasActiveRequest: Boolean(body.activeRequest),
  };
}

export async function movieStatus(tmdbId: number, userId: string): Promise<MovieState> {
  return toTitleState(await invoke({ op: "movieStatus", tmdbId, userId }, LOOKUP_TIMEOUT_MS));
}

export async function showStatus(tvdbId: number, userId: string): Promise<MovieState> {
  return toTitleState(await invoke({ op: "showStatus", tvdbId, userId }, LOOKUP_TIMEOUT_MS));
}

/** A duplicate is an answer, not a failure: the title is requested either way. */
export async function createRequest(draft: RequestDraft): Promise<void> {
  const body = asRecord(await invoke({ op: "createRequest", ...draft }, CREATE_TIMEOUT_MS));
  if (body.outcome !== "created" && body.outcome !== "duplicate") {
    throw new PlexRequestUnavailableError();
  }
}
