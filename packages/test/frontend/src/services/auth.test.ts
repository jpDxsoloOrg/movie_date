import { beforeEach, describe, expect, it, vi } from "vitest";

const cognito = vi.hoisted(() => ({
  authenticateUser: vi.fn(),
  poolSignUp: vi.fn(),
  getCurrentUser: vi.fn(),
  forgotPassword: vi.fn(),
  confirmPassword: vi.fn(),
  usernames: [] as string[],
}));

vi.mock("amazon-cognito-identity-js", () => {
  class AuthenticationDetails {}
  class CognitoUserAttribute {}
  class CognitoUserPool {
    signUp(...args: unknown[]) {
      return cognito.poolSignUp(...args);
    }
    getCurrentUser() {
      return cognito.getCurrentUser();
    }
  }
  class CognitoUser {
    constructor(data: { Username: string }) {
      cognito.usernames.push(data.Username);
    }
    authenticateUser(...args: unknown[]) {
      return cognito.authenticateUser(...args);
    }
    forgotPassword(...args: unknown[]) {
      return cognito.forgotPassword(...args);
    }
    confirmPassword(...args: unknown[]) {
      return cognito.confirmPassword(...args);
    }
  }
  return { AuthenticationDetails, CognitoUserAttribute, CognitoUserPool, CognitoUser };
});

import {
  AuthError,
  confirmForgotPassword,
  forgotPassword,
  getIdToken,
  isSignedIn,
  onAuthChange,
  revokeSessions,
  signIn,
  signOut,
  signUp,
} from "@movie-date/frontend/services/auth";
import { setAppConfig } from "@movie-date/frontend/services/config";

interface FakeCallbacks {
  onSuccess: () => void;
  onFailure: (error: unknown) => void;
}

function fakeSession(token: string) {
  return {
    getIdToken: () => ({ getJwtToken: () => token }),
    getRefreshToken: () => "refresh",
  };
}

function storedUser(overrides: Record<string, unknown> = {}) {
  return {
    getSession: vi.fn((callback: (error: unknown, session: unknown) => void) =>
      callback(null, fakeSession("stored-token")),
    ),
    refreshSession: vi.fn((_token: unknown, callback: (error: unknown, session: unknown) => void) =>
      callback(null, fakeSession("fresh-token")),
    ),
    signOut: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cognito.usernames.length = 0;
  cognito.getCurrentUser.mockReturnValue(null);
  setAppConfig({
    graphqlUrl: "https://x.appsync-api.us-east-1.amazonaws.com/graphql",
    realtimeUrl: "wss://x.appsync-realtime-api.us-east-1.amazonaws.com/graphql",
    userPoolId: "us-east-1_test",
    userPoolClientId: "client",
  });
});

describe("signIn", () => {
  it("normalises the email and tells listeners", async () => {
    cognito.authenticateUser.mockImplementation((_details: unknown, callbacks: FakeCallbacks) =>
      callbacks.onSuccess(),
    );
    const listener = vi.fn();
    const stop = onAuthChange(listener);

    await signIn("  Me@Example.COM ", "secret1");
    stop();

    expect(cognito.usernames).toEqual(["me@example.com"]);
    expect(listener).toHaveBeenCalledWith(true);
  });

  it("gives one message for a wrong password and an unknown account", async () => {
    for (const code of ["NotAuthorizedException", "UserNotFoundException"]) {
      cognito.authenticateUser.mockImplementationOnce((_details: unknown, callbacks: FakeCallbacks) =>
        callbacks.onFailure({ code }),
      );
      await expect(signIn("a@b.co", "secret1")).rejects.toMatchObject({
        code: "BAD_CREDENTIALS",
        message: "Incorrect email or password.",
      });
    }
  });

  it("reports a dropped connection as a network problem", async () => {
    cognito.authenticateUser.mockImplementation((_details: unknown, callbacks: FakeCallbacks) =>
      callbacks.onFailure(new TypeError("Failed to fetch")),
    );
    await expect(signIn("a@b.co", "secret1")).rejects.toMatchObject({ code: "NETWORK" });
  });
});

describe("signUp", () => {
  it("creates the account then signs in", async () => {
    cognito.poolSignUp.mockImplementation(
      (_u: string, _p: string, _a: unknown[], _v: unknown[], callback: (error: unknown) => void) =>
        callback(null),
    );
    cognito.authenticateUser.mockImplementation((_details: unknown, callbacks: FakeCallbacks) =>
      callbacks.onSuccess(),
    );

    await signUp("New@Example.com", "secret1");

    expect(cognito.poolSignUp.mock.calls[0]?.[0]).toBe("new@example.com");
    expect(cognito.authenticateUser).toHaveBeenCalledOnce();
  });

  it("doesn't try to sign in when the email is taken", async () => {
    cognito.poolSignUp.mockImplementation(
      (_u: string, _p: string, _a: unknown[], _v: unknown[], callback: (error: unknown) => void) =>
        callback({ code: "UsernameExistsException" }),
    );

    await expect(signUp("a@b.co", "secret1")).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
    expect(cognito.authenticateUser).not.toHaveBeenCalled();
  });
});

describe("forgot password", () => {
  it("treats an unknown account as success so it can't probe for emails", async () => {
    cognito.forgotPassword.mockImplementation((callbacks: FakeCallbacks) =>
      callbacks.onFailure({ code: "UserNotFoundException" }),
    );
    await expect(forgotPassword("nobody@b.co")).resolves.toBeUndefined();
  });

  it("surfaces rate limiting", async () => {
    cognito.forgotPassword.mockImplementation((callbacks: FakeCallbacks) =>
      callbacks.onFailure({ code: "LimitExceededException" }),
    );
    await expect(forgotPassword("a@b.co")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("explains a wrong code", async () => {
    cognito.confirmPassword.mockImplementation((_c: string, _p: string, callbacks: FakeCallbacks) =>
      callbacks.onFailure({ code: "CodeMismatchException" }),
    );
    await expect(confirmForgotPassword("a@b.co", "123", "secret1")).rejects.toMatchObject({
      code: "BAD_CODE",
    });
  });

  it("trims the pasted code", async () => {
    cognito.confirmPassword.mockImplementation((_c: string, _p: string, callbacks: FakeCallbacks) =>
      callbacks.onSuccess(),
    );
    await confirmForgotPassword("a@b.co", " 123456 ", "secret1");
    expect(cognito.confirmPassword.mock.calls[0]?.[0]).toBe("123456");
  });
});

describe("session", () => {
  it("is null with nobody signed in", async () => {
    await expect(getIdToken()).resolves.toBeNull();
    await expect(isSignedIn()).resolves.toBe(false);
  });

  it("returns the stored session's ID token", async () => {
    cognito.getCurrentUser.mockReturnValue(storedUser());
    await expect(getIdToken()).resolves.toBe("stored-token");
  });

  it("uses the refresh token when forced", async () => {
    const user = storedUser();
    cognito.getCurrentUser.mockReturnValue(user);
    await expect(getIdToken({ forceRefresh: true })).resolves.toBe("fresh-token");
    expect(user.refreshSession).toHaveBeenCalledOnce();
  });

  it("shares one session read between concurrent callers", async () => {
    const user = storedUser();
    cognito.getCurrentUser.mockReturnValue(user);
    await Promise.all([getIdToken(), getIdToken(), getIdToken()]);
    expect(user.getSession).toHaveBeenCalledOnce();
  });

  it("doesn't let a forced refresh piggyback on a read of the old token", async () => {
    cognito.getCurrentUser.mockReturnValue(storedUser());
    const [plain, forced] = await Promise.all([getIdToken(), getIdToken({ forceRefresh: true })]);
    expect(plain).toBe("stored-token");
    expect(forced).toBe("fresh-token");
  });

  it("signs out when the refresh token is dead", async () => {
    const user = storedUser({
      getSession: vi.fn((callback: (error: unknown, session: unknown) => void) =>
        callback({ code: "NotAuthorizedException" }, null),
      ),
    });
    cognito.getCurrentUser.mockReturnValue(user);
    const listener = vi.fn();
    const stop = onAuthChange(listener);

    await expect(getIdToken()).resolves.toBeNull();
    stop();

    expect(user.signOut).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith(false);
  });

  it("keeps the session through a network failure", async () => {
    const user = storedUser({
      getSession: vi.fn((callback: (error: unknown, session: unknown) => void) =>
        callback(new TypeError("Failed to fetch"), null),
      ),
    });
    cognito.getCurrentUser.mockReturnValue(user);

    await expect(getIdToken()).rejects.toBeInstanceOf(AuthError);
    await expect(isSignedIn()).resolves.toBe(true);
    expect(user.signOut).not.toHaveBeenCalled();
  });

  it("revokeSessions signs out everywhere with the live session", async () => {
    const globalSignOut = vi.fn((callbacks: FakeCallbacks) => callbacks.onSuccess());
    const user = storedUser({ globalSignOut });
    cognito.getCurrentUser.mockReturnValue(user);

    await revokeSessions();

    expect(user.getSession).toHaveBeenCalled();
    expect(globalSignOut).toHaveBeenCalledOnce();
  });

  it("revokeSessions never throws, so Log Out works offline", async () => {
    const globalSignOut = vi.fn((callbacks: FakeCallbacks) => callbacks.onFailure(new TypeError("offline")));
    cognito.getCurrentUser.mockReturnValue(storedUser({ globalSignOut }));
    await expect(revokeSessions()).resolves.toBeUndefined();
  });

  it("revokeSessions gives up on a stalled network", async () => {
    vi.useFakeTimers();
    cognito.getCurrentUser.mockReturnValue(storedUser({ globalSignOut: vi.fn() }));
    const finished = revokeSessions();
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(finished).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("revokeSessions has nothing to do when signed out", async () => {
    await expect(revokeSessions()).resolves.toBeUndefined();
  });

  it("signOut clears the session and notifies", () => {
    const user = storedUser();
    cognito.getCurrentUser.mockReturnValue(user);
    const listener = vi.fn();
    const stop = onAuthChange(listener);

    signOut();
    stop();

    expect(user.signOut).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith(false);
  });
});
