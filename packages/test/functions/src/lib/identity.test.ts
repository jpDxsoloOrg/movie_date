import { UnauthorizedError } from "@movie-date/functions/lib/errors";
import { isIamIdentity, userContext } from "@movie-date/functions/lib/identity";
import type { AppSyncIdentity, AppSyncIdentityCognito, AppSyncIdentityIAM } from "aws-lambda";
import { describe, expect, it } from "vitest";

const cognito = {
  sub: "user-1",
  claims: { email: "a@example.com" },
} as unknown as AppSyncIdentityCognito;
const iam = { userArn: "arn:aws:sts::1:assumed-role/x" } as unknown as AppSyncIdentityIAM;

describe("userContext", () => {
  it("reads the sub and the email claim", () => {
    expect(userContext(cognito)).toEqual({ userId: "user-1", email: "a@example.com" });
  });

  it("copes with an access token, which has no email claim", () => {
    const identity = { sub: "user-1", claims: {} } as unknown as AppSyncIdentityCognito;
    expect(userContext(identity)).toEqual({ userId: "user-1" });
  });

  it.each<[string, AppSyncIdentity]>([
    ["null", null],
    ["undefined", undefined],
    ["IAM", iam],
  ])("rejects a %s identity", (_label, identity) => {
    expect(() => userContext(identity)).toThrow(UnauthorizedError);
  });
});

describe("isIamIdentity", () => {
  it("tells IAM from Cognito", () => {
    expect(isIamIdentity(iam)).toBe(true);
    expect(isIamIdentity(cognito)).toBe(false);
    expect(isIamIdentity(null)).toBe(false);
  });
});
