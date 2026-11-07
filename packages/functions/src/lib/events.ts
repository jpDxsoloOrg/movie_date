import { Sha256 } from "@aws-crypto/sha256-js";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import type { RoomEventInput } from "@movie-date/core";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";

/** Subscribers only receive fields the mutation selected, so this must name every RoomEvent field. */
export const PUBLISH_MUTATION = `mutation PublishRoomEvent($input: RoomEventInput!) {
  publishRoomEvent(input: $input) {
    roomId
    type
    movieId
    matchId
    round
    actorId
  }
}`;

export const REVOKE_MUTATION = `mutation RevokeRoomSubscriptions($roomId: ID!, $userId: ID!) {
  revokeRoomSubscriptions(roomId: $roomId, userId: $userId)
}`;

/** Runs inside a user's swipe, so a stalled AppSync must not stall them with it. */
const PUBLISH_TIMEOUT_MS = 3000;

let signer: SignatureV4 | undefined;

function getSigner(): SignatureV4 {
  if (!signer) {
    signer = new SignatureV4({
      service: "appsync",
      region: process.env.AWS_REGION ?? "us-east-1",
      credentials: defaultProvider(),
      sha256: Sha256,
    });
  }
  return signer;
}

async function send(endpoint: URL, query: string, variables: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify({ query, variables });
  const signed = await getSigner().sign(
    new HttpRequest({
      method: "POST",
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      path: endpoint.pathname,
      headers: { host: endpoint.hostname, "content-type": "application/json" },
      body,
    }),
  );
  const response = await fetch(endpoint, {
    method: "POST",
    headers: signed.headers,
    body,
    signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`AppSync responded ${response.status}`);
  // AppSync reports a rejected mutation as a 200 with an errors array.
  const result = (await response.json()) as { errors?: unknown[] };
  if (result.errors?.length) throw new Error(`AppSync rejected: ${JSON.stringify(result.errors)}`);
}

/**
 * Best effort by design. The write this announces has already committed, and
 * clients recover missed events through `pendingMatch` on reconnect and focus,
 * so a failure here is logged and never reaches the caller.
 */
export async function publishRoomEvent(input: RoomEventInput): Promise<void> {
  try {
    const url = process.env.GRAPHQL_URL;
    if (!url) throw new Error("GRAPHQL_URL is not set");
    await send(new URL(url), PUBLISH_MUTATION, { input });
  } catch (error) {
    console.error(`Publishing ${input.type} failed`, error);
  }
}

/**
 * Membership is only checked when a subscription starts, so this is what stops one
 * outliving the membership. Best effort for the same reason as publishing: the move
 * has committed, and the worst a failure leaves is events without any room data.
 */
export async function revokeRoomSubscriptions(roomId: string, userId: string): Promise<void> {
  try {
    const url = process.env.GRAPHQL_URL;
    if (!url) throw new Error("GRAPHQL_URL is not set");
    await send(new URL(url), REVOKE_MUTATION, { roomId, userId });
  } catch (error) {
    console.error("Revoking room subscriptions failed", error);
  }
}
