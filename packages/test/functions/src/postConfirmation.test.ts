import {
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { handler } from "@movie-date/functions/postConfirmation";
import type { PostConfirmationTriggerEvent } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cognito = mockClient(CognitoIdentityProviderClient);

function event(triggerSource: PostConfirmationTriggerEvent["triggerSource"]): PostConfirmationTriggerEvent {
  return { triggerSource, userPoolId: "pool", userName: "someone" } as PostConfirmationTriggerEvent;
}

beforeEach(() => {
  cognito.reset();
  cognito.on(AdminUserGlobalSignOutCommand).resolves({});
  vi.stubEnv("AWS_REGION", "us-east-1");
});

describe("postConfirmation", () => {
  it("ends every session after a password reset", async () => {
    const input = event("PostConfirmation_ConfirmForgotPassword");
    await expect(handler(input)).resolves.toBe(input);
    expect(cognito.commandCalls(AdminUserGlobalSignOutCommand)[0]?.args[0].input).toEqual({
      UserPoolId: "pool",
      Username: "someone",
    });
  });

  it("leaves a sign-up alone", async () => {
    await handler(event("PostConfirmation_ConfirmSignUp"));
    expect(cognito.commandCalls(AdminUserGlobalSignOutCommand)).toHaveLength(0);
  });

  it("doesn't report a finished reset as failed when the sign-out fails", async () => {
    cognito.on(AdminUserGlobalSignOutCommand).rejects(new Error("no"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const input = event("PostConfirmation_ConfirmForgotPassword");
    await expect(handler(input)).resolves.toBe(input);
  });
});
