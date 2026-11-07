import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  type CognitoUserSession,
} from "amazon-cognito-identity-js";
import { appConfig } from "./config";

export type AuthErrorCode =
  | "BAD_CREDENTIALS"
  | "EMAIL_TAKEN"
  | "INVALID_PASSWORD"
  | "INVALID_EMAIL"
  | "BAD_CODE"
  | "EXPIRED_CODE"
  | "RATE_LIMITED"
  | "NETWORK"
  | "UNKNOWN";

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

const AUTH_ERRORS: Partial<Record<string, [AuthErrorCode, string]>> = {
  // One message for both, so the login form doesn't reveal which emails exist. Only
  // sign-up does, through EMAIL_TAKEN: Cognito can't hide that with email usernames.
  NotAuthorizedException: ["BAD_CREDENTIALS", "Incorrect email or password."],
  UserNotFoundException: ["BAD_CREDENTIALS", "Incorrect email or password."],
  UsernameExistsException: ["EMAIL_TAKEN", "An account with this email already exists."],
  InvalidPasswordException: ["INVALID_PASSWORD", "Password must be at least 6 characters"],
  InvalidParameterException: ["INVALID_EMAIL", "Please enter a valid email address."],
  CodeMismatchException: ["BAD_CODE", "That code isn't right. Check it and try again."],
  ExpiredCodeException: ["EXPIRED_CODE", "That code has expired. Request a new one."],
  LimitExceededException: ["RATE_LIMITED", "Too many attempts. Please wait a bit and try again."],
  TooManyRequestsException: ["RATE_LIMITED", "Too many attempts. Please wait a bit and try again."],
  TooManyFailedAttemptsException: ["RATE_LIMITED", "Too many attempts. Please wait a bit and try again."],
  NetworkError: ["NETWORK", "Can't reach the server. Check your connection and try again."],
};

function cognitoErrorName(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { code, name } = error as { code?: unknown; name?: unknown };
  if (typeof code === "string") return code;
  return typeof name === "string" ? name : undefined;
}

function toAuthError(error: unknown): AuthError {
  const mapped = AUTH_ERRORS[cognitoErrorName(error) ?? ""];
  if (mapped) return new AuthError(mapped[0], mapped[1]);
  // The SDK surfaces a dropped connection as a bare TypeError from fetch.
  if (error instanceof TypeError) {
    return new AuthError("NETWORK", "Can't reach the server. Check your connection and try again.");
  }
  return new AuthError("UNKNOWN", "Something went wrong. Please try again.");
}

/** Log Out waits on this, so a dead network can't hold it up for long. */
const REVOKE_TIMEOUT_MS = 3_000;

let pool: CognitoUserPool | undefined;
let poolKey = "";

function userPool(): CognitoUserPool {
  const { userPoolId, userPoolClientId } = appConfig();
  const key = `${userPoolId}/${userPoolClientId}`;
  if (!pool || poolKey !== key) {
    pool = new CognitoUserPool({ UserPoolId: userPoolId, ClientId: userPoolClientId });
    poolKey = key;
  }
  return pool;
}

/** The pool may be case sensitive, and "Me@x.com" must not become a second account. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function cognitoUser(email: string): CognitoUser {
  return new CognitoUser({ Username: normaliseEmail(email), Pool: userPool() });
}

type AuthListener = (signedIn: boolean) => void;
const listeners = new Set<AuthListener>();

/** Called on every sign in and sign out, including a session that dies on refresh. */
export function onAuthChange(listener: AuthListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(signedIn: boolean): void {
  for (const listener of listeners) listener(signedIn);
}

export async function signIn(email: string, password: string): Promise<void> {
  const user = cognitoUser(email);
  const details = new AuthenticationDetails({
    Username: normaliseEmail(email),
    Password: password,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      user.authenticateUser(details, {
        onSuccess: () => resolve(),
        onFailure: reject,
      });
    });
  } catch (error) {
    throw toAuthError(error);
  }
  notify(true);
}

/** The PreSignUp trigger auto-confirms, so an account can log straight in. */
export async function signUp(email: string, password: string): Promise<void> {
  const username = normaliseEmail(email);
  try {
    await new Promise<void>((resolve, reject) => {
      userPool().signUp(
        username,
        password,
        [new CognitoUserAttribute({ Name: "email", Value: username })],
        [],
        (error) => (error ? reject(error) : resolve()),
      );
    });
  } catch (error) {
    throw toAuthError(error);
  }
  await signIn(username, password);
}

/**
 * Revokes this user's refresh tokens on every device. Best effort: Log Out must work
 * offline, so a failure or a stall leaves it to signOut() to clear this device.
 * Run it first, because revoking needs the tokens signOut() throws away.
 */
export async function revokeSessions(): Promise<void> {
  const user = userPool().getCurrentUser();
  if (!user) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      readSession(user).then(
        () =>
          new Promise<void>((resolve, reject) => {
            user.globalSignOut({ onSuccess: () => resolve(), onFailure: reject });
          }),
      ),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, REVOKE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // The session still ends here, and the tokens simply run out on their own.
  } finally {
    clearTimeout(timer);
  }
}

/** Clears this device. Pair with revokeSessions() when the person chose to leave. */
export function signOut(): void {
  userPool().getCurrentUser()?.signOut();
  notify(false);
}

export async function forgotPassword(email: string): Promise<void> {
  const user = cognitoUser(email);
  try {
    await new Promise<void>((resolve, reject) => {
      user.forgotPassword({ onSuccess: () => resolve(), onFailure: reject });
    });
  } catch (error) {
    // The app client hides this from raw API callers too. This is the fallback, so
    // the form still reads as success if that setting is ever off. Neither covers
    // sign-up, which has to say when an email is taken.
    if (cognitoErrorName(error) === "UserNotFoundException") return;
    throw toAuthError(error);
  }
}

export async function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  const user = cognitoUser(email);
  try {
    await new Promise<void>((resolve, reject) => {
      user.confirmPassword(code.trim(), newPassword, {
        onSuccess: () => resolve(),
        onFailure: reject,
      });
    });
  } catch (error) {
    throw toAuthError(error);
  }
}

function readSession(user: CognitoUser): Promise<CognitoUserSession> {
  return new Promise((resolve, reject) => {
    user.getSession((error: Error | null, session: CognitoUserSession | null) => {
      if (error || !session) reject(error ?? new Error("No session"));
      else resolve(session);
    });
  });
}

function refreshSession(user: CognitoUser, current: CognitoUserSession): Promise<CognitoUserSession> {
  return new Promise((resolve, reject) => {
    user.refreshSession(current.getRefreshToken(), (error: unknown, session: CognitoUserSession) => {
      if (error) reject(error);
      else resolve(session);
    });
  });
}

let sessionInFlight: Promise<string | null> | undefined;

async function loadIdToken(forceRefresh: boolean): Promise<string | null> {
  const user = userPool().getCurrentUser();
  if (!user) return null;
  try {
    // getSession refreshes an expired token itself.
    const session = await readSession(user);
    const fresh = forceRefresh ? await refreshSession(user, session) : session;
    return fresh.getIdToken().getJwtToken();
  } catch (error) {
    // A dead refresh token means the session is over; a dropped connection doesn't.
    if (cognitoErrorName(error) === "NotAuthorizedException") {
      signOut();
      return null;
    }
    throw toAuthError(error);
  }
}

/**
 * The ID token rather than the access token: `me` reads the email claim, which
 * only the ID token has. Null when signed out; throws AuthError if the session
 * can't be checked right now. Concurrent callers share one refresh, because
 * Cognito would otherwise see the same refresh token used several times at once.
 */
export async function getIdToken(options?: { forceRefresh?: boolean }): Promise<string | null> {
  // A forced refresh exists because the current token was refused, so it can't
  // share a read that may hand back that same token.
  if (options?.forceRefresh && sessionInFlight) await sessionInFlight.catch(() => undefined);
  sessionInFlight ??= loadIdToken(options?.forceRefresh ?? false).finally(() => {
    sessionInFlight = undefined;
  });
  return sessionInFlight;
}

export async function isSignedIn(): Promise<boolean> {
  try {
    return (await getIdToken()) !== null;
  } catch {
    // Launched offline with a stored session: let the app shell come up.
    return userPool().getCurrentUser() !== null;
  }
}
