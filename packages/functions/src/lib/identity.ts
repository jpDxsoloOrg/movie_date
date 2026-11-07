import type { AppSyncIdentity } from "aws-lambda";
import { UnauthorizedError } from "./errors.js";

export interface ResolverContext {
  /** Cognito sub of the caller, or SYSTEM_USER_ID for the backend's IAM calls. */
  userId: string;
  /** Present only when the client authenticates with an ID token; access tokens omit it. */
  email?: string;
}

export type ResolverHandler<Args> = (args: Args, context: ResolverContext) => Promise<unknown>;

/** Not a valid Cognito sub, so it can never collide with a real user's rows. */
export const SYSTEM_USER_ID = "system";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isIamIdentity(identity: AppSyncIdentity): boolean {
  return isRecord(identity) && typeof identity.userArn === "string";
}

export function userContext(identity: AppSyncIdentity): ResolverContext {
  if (!isRecord(identity) || typeof identity.sub !== "string" || identity.sub === "") {
    throw new UnauthorizedError();
  }
  const claims: unknown = identity.claims;
  const email = isRecord(claims) && typeof claims.email === "string" ? claims.email : undefined;
  return { userId: identity.sub, ...(email ? { email } : {}) };
}
